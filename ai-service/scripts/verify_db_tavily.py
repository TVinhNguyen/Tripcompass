"""
scripts/verify_db_tavily.py

Tavily-powered verification of all attraction / food_venue / combo records.
Uses 3 batch Tavily searches per destination (~234 searches total for 78 destinations).

Generates:
  scripts/db_patch_verified.sql  — SQL UPDATE statements to apply
  scripts/verify_notes.json      — full per-destination notes

Run inside ai-service Docker container:
    docker run --rm --network host \\
      -v $(pwd)/ai-service:/app \\
      -e TAVILY_API_KEY=<key> \\
      -e DB_HOST=localhost \\
      tripcompass-ai python scripts/verify_db_tavily.py

Apply patch:
    docker exec -i tripcompass-postgres-1 psql -U postgres -d tripcompass \\
        < scripts/db_patch_verified.sql
"""

from __future__ import annotations

import json, os, re, sys, time
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from tavily import TavilyClient

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")
if not TAVILY_API_KEY:
    sys.exit("TAVILY_API_KEY not set")

DB_HOST     = os.environ.get("DB_HOST", "localhost")
DB_PORT     = int(os.environ.get("DB_PORT", "5432"))
DB_NAME     = os.environ.get("DB_NAME", "tripcompass")
DB_USER     = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "postgres")

SQL_OUT   = Path(__file__).parent / "db_patch_verified.sql"
NOTES_OUT = Path(__file__).parent / "verify_notes.json"

client = TavilyClient(api_key=TAVILY_API_KEY)

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
        options="-c search_path=schema_travel",
    )


def db_query(sql: str, params=None) -> list[dict]:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def get_attractions(dest: str) -> list[dict]:
    return db_query(
        "SELECT id::text, name, price_vnd, is_free, address FROM attractions WHERE destination=%s",
        (dest,),
    )


def get_food_venues(dest: str) -> list[dict]:
    return db_query(
        "SELECT id::text, name, price_min, price_max, specialty FROM food_venues WHERE destination=%s",
        (dest,),
    )


def get_combos(dest: str) -> list[dict]:
    return db_query(
        "SELECT id::text, name, provider, price_per_person, duration_days FROM combos WHERE destination=%s",
        (dest,),
    )


def get_all_destinations() -> list[str]:
    rows = db_query("SELECT DISTINCT destination FROM attractions ORDER BY destination")
    return [r["destination"] for r in rows]


# ── Tavily helpers ────────────────────────────────────────────────────────────

def tavily_search(query: str, max_results: int = 6) -> dict:
    for attempt in range(3):
        try:
            return client.search(
                query=query, max_results=max_results,
                search_depth="basic", include_answer=True,
            )
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower():
                wait = (attempt + 1) * 8
                print(f"    ⏳ Rate limit — {wait}s...")
                time.sleep(wait)
            else:
                print(f"    ⚠ Tavily: {e}")
                return {}
    return {}


def full_text(res: dict) -> str:
    return (res.get("answer") or "") + "\n" + \
           "\n".join(r.get("content", "") for r in res.get("results", []))


def extract_vnd(text: str, lo: int = 0, hi: int = 50_000_000) -> list[int]:
    prices = []
    for m in re.finditer(
        r'([\d][,\d]*\.?\d*)\s*(?:VND|VNĐ|vnđ|vnd|đồng|dong|₫)',
        text, re.IGNORECASE,
    ):
        try:
            v = int(re.sub(r'[,.\s]', '', m.group(1)))
            if lo <= v <= hi:
                prices.append(v)
        except ValueError:
            pass
    return sorted(set(prices))


def _find_mention(text: str, name: str, window: int = 350) -> str | None:
    patterns = [re.escape(name)]
    words = name.split()
    if len(words) >= 2:
        patterns.append(re.escape(" ".join(words[:2])))
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            start = max(0, m.start() - 50)
            return text[start : min(len(text), m.end() + window)]
    return None


# ── Per-destination verification ──────────────────────────────────────────────

def verify_destination(dest: str) -> tuple[list[str], list[str]]:
    sql_updates: list[str] = []
    notes: list[str] = []

    def note(msg: str):
        print(f"    {msg}")
        notes.append(msg)

    # 3 batch Tavily searches
    print(f"  🔍 Attractions prices…")
    attr_res  = tavily_search(f"bảng giá vé tham quan {dest} 2026 VND danh sách")
    time.sleep(0.8)
    print(f"  🔍 Food prices…")
    food_res  = tavily_search(f"giá ăn uống nhà hàng quán ngon {dest} 2026 VND")
    time.sleep(0.8)
    print(f"  🔍 Combo/tour prices…")
    combo_res = tavily_search(f"combo tour du lịch {dest} 2 3 ngày giá 2026 VND")
    time.sleep(0.5)

    attr_text  = full_text(attr_res)
    food_text  = full_text(food_res)
    combo_text = full_text(combo_res)

    # ── Attractions ───────────────────────────────────────────────────────
    attrs = get_attractions(dest)
    note(f"--- Attractions ({len(attrs)}) ---")
    for attr in attrs:
        name  = attr["name"]
        price = attr["price_vnd"] or 0
        free  = attr["is_free"]

        excerpt = _find_mention(attr_text, name, 350)
        prices  = extract_vnd(excerpt, lo=5_000, hi=1_500_000) if excerpt else []

        is_free_mention = bool(re.search(
            r'(?:miễn phí|free|không mất phí)', excerpt or "", re.IGNORECASE
        ))

        if is_free_mention and not prices:
            if not free:
                note(f"  ✗ {name}: DB={price:,} → FREE (Tavily)")
                sql_updates.append(
                    f"UPDATE attractions SET is_free=true, price_vnd=0, price_updated_at=NOW() "
                    f"WHERE id='{attr['id']}'; -- Tavily: free"
                )
            else:
                note(f"  ✓ {name}: FREE (confirmed)")
        elif prices:
            t_price  = prices[0]
            diff_pct = abs(t_price - price) / max(price, 1) * 100 if price > 0 else 100

            if price == 0 and not free and t_price > 0:
                note(f"  ✗ {name}: DB=0 (not free) → Tavily {t_price:,}")
                sql_updates.append(
                    f"UPDATE attractions SET price_vnd={t_price}, is_free=false, price_updated_at=NOW() "
                    f"WHERE id='{attr['id']}'; -- Tavily: {t_price:,}"
                )
            elif diff_pct > 20 and price > 0:
                note(f"  ✗ {name}: DB={price:,} → Tavily ~{t_price:,} (Δ{diff_pct:.0f}%)")
                sql_updates.append(
                    f"UPDATE attractions SET price_vnd={t_price}, price_updated_at=NOW() "
                    f"WHERE id='{attr['id']}'; -- Tavily: {t_price:,}"
                )
            else:
                note(f"  ✓ {name}: {price:,} (~ok, Tavily {t_price:,})")
        else:
            note(f"  ? {name}: no Tavily price (DB={price:,})")

    # ── Food venues ───────────────────────────────────────────────────────
    venues = get_food_venues(dest)
    note(f"--- Food venues ({len(venues)}) ---")
    for v in venues:
        name  = v["name"]
        p_min = v["price_min"] or 0
        p_max = v["price_max"] or 0

        excerpt = _find_mention(food_text, name, 350)
        prices  = extract_vnd(excerpt, lo=10_000, hi=800_000) if excerpt else []

        if prices and len(prices) >= 2:
            t_min, t_max = prices[0], prices[-1]
            d_min = abs(t_min - p_min) / max(p_min, 1) * 100
            d_max = abs(t_max - p_max) / max(p_max, 1) * 100
            if d_min > 25 or d_max > 25:
                note(f"  ✗ {name}: DB={p_min:,}-{p_max:,} → Tavily {t_min:,}-{t_max:,}")
                sql_updates.append(
                    f"UPDATE food_venues SET price_min={t_min}, price_max={t_max}, price_updated_at=NOW() "
                    f"WHERE id='{v['id']}'; -- Tavily: {t_min:,}-{t_max:,}"
                )
            else:
                note(f"  ✓ {name}: {p_min:,}-{p_max:,} (~ok)")
        elif prices:
            t_price = prices[0]
            if p_min == 0:
                note(f"  ✗ {name}: DB=0 → Tavily ~{t_price:,}")
                sql_updates.append(
                    f"UPDATE food_venues SET price_min={t_price}, price_max={t_price*2}, price_updated_at=NOW() "
                    f"WHERE id='{v['id']}'; -- Tavily: ~{t_price:,}"
                )
            else:
                note(f"  ? {name}: Tavily {t_price:,}, DB={p_min:,}-{p_max:,}")
        else:
            note(f"  ? {name}: no Tavily price (DB={p_min:,}-{p_max:,})")

    # ── Combos ────────────────────────────────────────────────────────────
    combos = get_combos(dest)
    note(f"--- Combos ({len(combos)}) ---")
    for combo in combos:
        name  = combo["name"]
        price = combo["price_per_person"] or 0
        excerpt = _find_mention(combo_text, name, 400)
        c_prices = extract_vnd(excerpt or combo_text[:1000], lo=200_000, hi=25_000_000)
        if c_prices:
            t_price = c_prices[0]
            diff = abs(t_price - price) / max(price, 1) * 100 if price > 0 else 100
            if diff > 25 and price > 0:
                note(f"  ✗ combo {name}: DB={price:,} → Tavily ~{t_price:,} (Δ{diff:.0f}%)")
                sql_updates.append(
                    f"UPDATE combos SET price_per_person={t_price}, price_updated_at=NOW() "
                    f"WHERE id='{combo['id']}'; -- Tavily: {t_price:,}"
                )
            else:
                note(f"  ✓ combo {name}: {price:,} (~ok)")
        else:
            note(f"  ? combo {name}: no Tavily price (DB={price:,})")

    return sql_updates, notes


# ── Main ──────────────────────────────────────────────────────────────────────

PRIORITY = [
    "ho chi minh", "da nang", "ha noi", "nha trang", "hue",
    "can tho", "phu quoc", "ninh binh", "da lat", "lam dong",
    "sa pa", "lao cai", "ha long", "quang ninh", "hoi an",
    "quy nhon", "hai phong", "vung tau", "mui ne", "phu tho",
    "dak lak", "tuyen quang", "quang ngai", "quang tri", "nghe an",
    "thai nguyen", "vinh long", "gia lai", "ha giang", "son la",
    "ca mau", "phu yen", "quang binh", "cat ba", "tay ninh",
    "moc chau", "hung yen", "ninh thuan", "dong nai", "kon tum",
    "buon ma thuot", "dien bien", "lang son", "cao bang", "tam dao",
    "dong thap", "nam dinh", "bac kan", "bac lieu", "bac ninh",
    "binh dinh", "binh thuan", "dak nong", "ha tinh", "hoa binh",
    "khanh hoa", "kien giang", "lai chau", "mai chau", "pleiku",
    "soc trang", "thanh hoa", "vinh", "hau giang", "ba ria vung tau",
    "ha nam", "hai duong", "binh phuoc", "thai binh", "binh duong",
    "vinh phuc", "tien giang", "tra vinh", "ben tre", "bac giang",
    "phan thiet", "an giang", "long an",
]


def main():
    print("Connecting to DB...")
    try:
        all_destinations = get_all_destinations()
    except Exception as e:
        sys.exit(f"DB connection failed: {e}\nSet DB_HOST, DB_PORT, DB_USER, DB_PASSWORD env vars.")

    print(f"Total destinations: {len(all_destinations)}\n")

    extra   = [d for d in all_destinations if d not in PRIORITY]
    ordered = [d for d in PRIORITY if d in all_destinations] + extra

    all_updates: list[str] = []
    all_notes:   dict[str, list[str]] = {}
    search_count = 0

    for i, dest in enumerate(ordered, 1):
        print(f"\n{'='*60}")
        print(f"[{i}/{len(ordered)}] {dest.upper()}")
        print(f"{'='*60}")

        updates, notes = verify_destination(dest)
        all_updates.extend(updates)
        all_notes[dest] = notes
        search_count += 3
        print(f"  → {len(updates)} update(s) | total searches: {search_count}")
        time.sleep(1.0)

        if i % 10 == 0:
            _write_sql(all_updates)
            _write_notes(all_notes)
            print(f"\n  💾 Checkpoint saved ({i}/{len(ordered)})")

    _write_sql(all_updates)
    _write_notes(all_notes)

    print(f"\n{'='*60}")
    print(f"✅ Done!")
    print(f"   Destinations: {len(ordered)}")
    print(f"   Searches:     ~{search_count}")
    print(f"   SQL updates:  {len(all_updates)}")
    print(f"\n   SQL:   {SQL_OUT}")
    print(f"   Notes: {NOTES_OUT}")
    print(f"\nApply:")
    print(f"   docker exec -i tripcompass-postgres-1 psql -U postgres -d tripcompass < scripts/db_patch_verified.sql")


def _write_sql(updates: list[str]):
    with open(SQL_OUT, "w", encoding="utf-8") as f:
        f.write("-- Tavily verification patch — 2026-03-29\n-- Review before applying!\n\n")
        f.write("SET search_path TO schema_travel;\nBEGIN;\n\n")
        for stmt in updates:
            f.write(stmt + "\n")
        f.write("\nCOMMIT;\n")


def _write_notes(notes: dict):
    with open(NOTES_OUT, "w", encoding="utf-8") as f:
        json.dump(notes, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
