"""
app/agents/decision_engine.py

Pure Python Decision Engine — không dùng LLM.

Nhận: budget + research đã collect
Ra quyết định về:
  1. Attractions nào fit budget → phân công vào ngày cụ thể (geo-clustered)
  2. Combo có tốt hơn mua lẻ không?
  3. Food map theo khu vực mỗi ngày
  4. Budget recap cuối cùng

Output: state["decisions"] — Planner chỉ đọc dict này, không cần đọc raw research.

KHÔNG quyết định:
  - Hotel (user tự chọn hoặc hỏi hotel_advisor)
  - Transport đến thành phố (user tự chọn hoặc hỏi transport_advisor)
  - Những gì nằm ngoài activity_budget
"""

from __future__ import annotations
import re
from datetime import datetime, timedelta

from app.config.settings import console
from app.utils.geo_utils import (
    cluster_attractions_by_area,
    assign_attractions_to_days,
    build_food_map,
    describe_schedule,
    get_area_config,
    estimate_travel_min,
)
from app.services.combo_optimizer import evaluate_combos
from app.utils.time_slots import build_daily_time_slots, build_brief_from_day_plans


# ---------------------------------------------------------------------------
# Helpers: parse raw research text thành structured list
# ---------------------------------------------------------------------------

def _split_into_blocks(text: str) -> list[list[str]]:
    """
    Split research text into blocks, handling multiple LLM output formats:
    - ### Header / ## Header / #### Header
    - **Bold name** on its own line
    - 1. Numbered list items
    - Numbered items with bold: 1. **Name**
    Returns list of blocks, each block is a list of lines (first line = name).
    """
    if not text:
        return []

    # Try markdown headers first (##, ###, ####)
    header_blocks = re.split(r'\n(?:#{2,4})\s+(?:\d+\.\s*)?', "\n" + text)
    if len(header_blocks) > 1:
        result = []
        for block in header_blocks[1:]:
            lines = [ln for ln in block.strip().split('\n') if ln.strip()]
            if lines:
                result.append(lines)
        if result:
            return result

    # Try numbered list with bold: "1. **Name**" or "1. Name"
    num_pattern = re.compile(r'^(\d+)\.\s+\*{0,2}([^*\n]{4,80}?)\*{0,2}\s*$', re.MULTILINE)
    matches = list(num_pattern.finditer(text))
    if len(matches) >= 3:
        result = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            block_text = text[start:end]
            lines = [ln for ln in block_text.strip().split('\n') if ln.strip()]
            if lines:
                # Clean the first line: remove "1. **" prefix
                lines[0] = re.sub(r'^\d+\.\s+\*{0,2}', '', lines[0]).rstrip('*').strip()
                result.append(lines)
        if result:
            return result

    # Try bold headers on their own line: "**Name**"
    bold_pattern = re.compile(r'^\*{2}([^*\n]{4,80}?)\*{2}\s*$', re.MULTILINE)
    matches = list(bold_pattern.finditer(text))
    if len(matches) >= 3:
        result = []
        for i, m in enumerate(matches):
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            block_text = text[start:end]
            lines = [ln for ln in block_text.strip().split('\n') if ln.strip()]
            if lines:
                lines[0] = m.group(1).strip()
                result.append(lines)
        if result:
            return result

    return []


def _parse_attractions(attr_text: str, num_people: int) -> list[dict]:
    """
    Parse attractions research text → list of dicts.
    Hỗ trợ nhiều format: ### Header, **Bold**, numbered list.
    """
    attractions: list[dict] = []

    blocks = _split_into_blocks(attr_text or "")
    for block_lines in blocks:
        if not block_lines:
            continue
        name   = re.sub(r'\*+', '', block_lines[0]).strip()

        addr     = ''
        price    = 0
        hours    = ''
        source   = ''
        free     = False
        area     = ''
        full_day = False

        for line in block_lines[1:]:
            l = line.strip().lstrip('- *')

            if re.search(r'^area\s*[:：]', l, re.IGNORECASE):
                area = re.sub(r'\*+|Area\s*[:：]', '', l, flags=re.IGNORECASE).strip().lower()

            elif re.search(r'^full.?day\s*[:：]', l, re.IGNORECASE):
                full_day = bool(re.search(r'true|yes|1', l, re.IGNORECASE))

            elif re.search(r'address|địa chỉ|location|vị trí', l, re.IGNORECASE):
                addr = re.sub(r'\*+|Address:|Địa chỉ:|Location:', '', l, flags=re.IGNORECASE).strip()

            elif re.search(r'admission|giá vé|price|ticket|giá|cost|phí', l, re.IGNORECASE):
                if re.search(r'free|miễn phí|FREE', l, re.IGNORECASE):
                    free  = True
                    price = 0
                else:
                    pm = (
                        re.search(r'(\d[\d,_.]+)\s*VND/person', l, re.IGNORECASE) or
                        re.search(r'(\d[\d,_.]+)\s*VND/người', l, re.IGNORECASE) or
                        re.search(r'(\d[\d,_.]+)\s*(?:đồng|VND|vnđ)', l, re.IGNORECASE) or
                        re.search(r'(\d[\d,_.]+)\s*k\b', l, re.IGNORECASE)
                    )
                    if pm:
                        raw = pm.group(1).replace(',', '').replace('.', '').replace('_', '')
                        price = int(raw)
                        # Handle "50k" format
                        if re.search(r'\d+k\b', l, re.IGNORECASE) and price < 10_000:
                            price *= 1000
                src_m = re.search(r'source\s*[:：]\s*(.+)', l, re.IGNORECASE)
                if src_m:
                    source = src_m.group(1).strip().rstrip(')')

            elif re.search(r'hours?|open|giờ|mở|time', l, re.IGNORECASE):
                hours = re.sub(r'\*+|Hours?:|Open:|Giờ:|Time:', '', l, flags=re.IGNORECASE).strip()

        if name and len(name) > 3:
            attractions.append({
                'name':              name,
                'address':           addr,
                'price_per_person':  price,
                'cost_for_group':    price * num_people,
                'hours':             hours,
                'source':            source,
                'free':              free or price == 0,
                'area':              area,
                'full_day':          full_day,
            })

    # Dedup: remove entries where names differ only by diacritics/spacing
    # (e.g. "Tháp Bà Ponagar" vs "Thap Ba Ponagar" — keep the one with more info)
    seen: dict[str, int] = {}  # normalized_key → index in attractions list
    deduped: list[dict] = []
    for attr in attractions:
        key = re.sub(r'[^a-z0-9\s]', '', attr['name'].lower())
        key = re.sub(r'\s+', ' ', key).strip()
        if key in seen:
            prev = deduped[seen[key]]
            # Keep the entry with longer address (more specific)
            if len(attr.get('address', '')) > len(prev.get('address', '')):
                deduped[seen[key]] = attr
        else:
            seen[key] = len(deduped)
            deduped.append(attr)
    return deduped


def _parse_food_venues(food_text: str) -> list[dict]:
    """
    Parse food research text → list of venue dicts.
    Hỗ trợ nhiều format: ### Header, **Bold**, numbered list, | Table |.
    """
    venues: list[dict] = []
    seen:   set[str]   = set()

    # --- Format 1: Structured blocks (### Header, **Bold**, numbered) ---
    blocks = _split_into_blocks(food_text)
    for block_lines in blocks:
        if not block_lines:
            continue
        name  = re.sub(r'\*+|\d+\.\s*[\U0001F300-\U0001FFFF\u2600-\u26FF]*\s*', '', block_lines[0]).strip()

        addr    = ''
        price   = ''
        spec    = ''
        hours   = ''
        notes   = ''

        for line in block_lines[1:]:
            l = line.strip().lstrip('- |*')
            if re.search(r'address|địa chỉ|location|vị trí', l, re.IGNORECASE):
                addr = re.sub(r'\*+|Address:|Địa chỉ:|Location:|Address\s*\|', '', l, flags=re.IGNORECASE).strip()[:80]
            elif re.search(r'price|giá|cost|chi phí', l, re.IGNORECASE):
                price = re.sub(r'\*+|Price:|Giá:|Cost:', '', l, flags=re.IGNORECASE).strip()[:60]
            elif re.search(r'specialty|đặc sản|dish|món', l, re.IGNORECASE):
                spec = re.sub(r'\*+|Specialty:|Đặc sản:|Dish:|Món:', '', l, flags=re.IGNORECASE).strip()[:60]
            elif re.search(r'hours?|giờ|time', l, re.IGNORECASE):
                hours = re.sub(r'\*+|Hours?:|Giờ:|Time:', '', l, flags=re.IGNORECASE).strip()[:40]
            elif re.search(r'notes?|lưu ý|tip', l, re.IGNORECASE):
                notes = re.sub(r'\*+|Notes?:|Lưu ý:|Tip:', '', l, flags=re.IGNORECASE).strip()[:80]

        key = name.lower().strip()
        if name and len(name) > 3 and (addr or price or spec) and key not in seen:
            seen.add(key)
            venues.append({
                'name': name, 'address': addr, 'price': price,
                'specialty': spec, 'hours': hours, 'notes': notes,
            })

    # --- Format 2: | Table | ---
    for row in re.findall(
        r'^\|\s*\*{0,2}([^|*]{4,50}?)\*{0,2}\s*\|\s*([^|]{10,80}?)\s*\|\s*([^|]{5,50}?)\s*\|',
        food_text, re.MULTILINE,
    ):
        name, addr, price = [c.strip() for c in row]
        if re.search(r'^(restaurant|market|address|price|meal|type|name|hang)', name, re.IGNORECASE):
            continue
        key = name.lower().strip()
        if name and len(name) > 3 and key not in seen:
            seen.add(key)
            venues.append({
                'name': name, 'address': addr, 'price': price,
                'specialty': '', 'hours': '', 'notes': '',
            })

    return venues


# ---------------------------------------------------------------------------
# Main Decision Engine node
# ---------------------------------------------------------------------------

def decision_engine(state: dict) -> dict:
    """
    LangGraph node — thuần Python, không LLM.

    Reads:
        state["trip"]     — destination, num_people, num_days, activity_budget
        state["research"] — attractions, food, combos

    Writes:
        state["decisions"] — dict brief cho Planner
    """
    console.print("\n[bold yellow]━━━ DECISION ENGINE ━━━[/bold yellow]")

    trip     = state["trip"]
    research = state.get("research", {})
    budget   = {}

    destination     = trip.get("destination", "")
    num_people      = trip.get("num_people", 2)
    num_days        = trip.get("num_days", 4)
    total_budget    = trip.get("budget_vnd", 10_000_000)

    activity_budget = total_budget

    attr_text   = research.get("attractions", "")
    food_text   = research.get("food", "")
    combos_text = research.get("combos", "")

    # ── 1. PARSE RESEARCH ─────────────────────────────────────────────────
    console.print("  Parsing research data...")
    # Debug: show first 200 chars of each research text to help diagnose parse issues
    if attr_text:
        console.print(f"  [dim]attractions preview: {attr_text[:200].replace(chr(10), ' | ')}[/dim]")
    if food_text:
        console.print(f"  [dim]food preview: {food_text[:200].replace(chr(10), ' | ')}[/dim]")

    all_attractions = _parse_attractions(attr_text, num_people)
    food_venues     = _parse_food_venues(food_text)

    console.print(f"  Found: {len(all_attractions)} attractions, {len(food_venues)} food venues")

    # ── 2. SELECT ATTRACTIONS WITHIN BUDGET ───────────────────────────────
    console.print("  Selecting attractions within activity budget...")

    # Phân tích budget cho attractions (50% của activity_budget, phần còn lại cho food)
    food_budget  = int(activity_budget * 0.40)
    attr_budget  = int(activity_budget * 0.45)
    local_misc   = activity_budget - food_budget - attr_budget  # grab, nước, quà...

    # Sort: free trước, rồi paid theo giá tăng dần (pick nhiều điểm nhất)
    free_attrs = [a for a in all_attractions if a['free']]
    paid_attrs = sorted(
        [a for a in all_attractions if not a['free']],
        key=lambda x: x['price_per_person'],
    )

    selected_attrs: list[dict] = list(free_attrs)
    spent_attr = 0
    for attr in paid_attrs:
        if spent_attr + attr['cost_for_group'] <= attr_budget:
            selected_attrs.append(attr)
            spent_attr += attr['cost_for_group']

    console.print(
        f"  Selected {len(selected_attrs)} attractions "
        f"({len(free_attrs)} free + {len(selected_attrs)-len(free_attrs)} paid), "
        f"cost: {spent_attr:,} VND"
    )

    # ── 3. COMBO CHECK ────────────────────────────────────────────────────
    combo_result = {"use_combo": False, "best_combo": None, "summary": "", "schedule_impact": ""}

    if combos_text and selected_attrs:
        console.print("  Evaluating combos vs itemized...")
        combo_result = evaluate_combos(
            combos_text=combos_text,
            attractions=selected_attrs,
            activity_budget=activity_budget,
            num_people=num_people,
        )
        if combo_result["use_combo"]:
            best = combo_result["best_combo"]
            console.print(f"  [green]Combo recommended:[/green] {best.combo.name} "
                          f"— {best.combo.price_total:,} VND")
            console.print(f"  {combo_result['summary'][:100]}")
        else:
            console.print("  [dim]No combo better than itemized — keeping selected attractions[/dim]")

    # ── 4. GEO-CLUSTER + SCHEDULE ─────────────────────────────────────────
    console.print("  Clustering attractions by area...")

    clusters = cluster_attractions_by_area(selected_attrs, destination)
    console.print(
        f"  Areas: " +
        ", ".join(f"{area}({len(items)})" for area, items in clusters.items() if items)
    )

    daily_schedule = assign_attractions_to_days(clusters, num_days, destination)

    # Nếu combo được chọn, đánh dấu ngày combo và loại attractions đã included
    if combo_result["use_combo"] and combo_result.get("best_combo"):
        best = combo_result["best_combo"]
        combo_includes_lower = {item.lower() for item in best.combo.includes}
        combo_duration = best.combo.duration_days

        # Tìm ngày tốt nhất để xếp combo (ngày có nhiều overlap nhất)
        best_day = 2  # default ngày 2
        best_overlap = 0
        for day_n, attrs in daily_schedule.items():
            if day_n == 1 or day_n == num_days:
                continue
            overlap_count = sum(
                1 for a in attrs
                if any(word in a["name"].lower() for inc in combo_includes_lower
                       for word in inc.split() if len(word) > 3)
            )
            if overlap_count > best_overlap:
                best_overlap = overlap_count
                best_day = day_n

        # Đánh dấu ngày combo
        combo_days = list(range(best_day, min(best_day + combo_duration, num_days)))
        for cd in combo_days:
            # Giữ lại attractions không có trong combo, bỏ đã included
            remaining = [
                a for a in daily_schedule.get(cd, [])
                if not any(word in a["name"].lower() for inc in combo_includes_lower
                           for word in inc.split() if len(word) > 3)
            ]
            # Thêm marker cho combo
            combo_marker = {
                "name": f"[COMBO] {best.combo.name}",
                "address": "",
                "price_per_person": best.combo.price_per_person,
                "cost_for_group": best.combo.price_total,
                "hours": "",
                "source": best.combo.source,
                "free": False,
                "is_combo": True,
            }
            daily_schedule[cd] = [combo_marker] + remaining

        console.print(f"  [green]Combo xếp vào ngày {combo_days}[/green]")

    # ── 5. FOOD MAP ───────────────────────────────────────────────────────
    console.print("  Mapping food venues to days...")

    food_map = build_food_map(food_venues, daily_schedule, destination)

    food_per_meal = max(
        50_000,
        food_budget // (num_days * 3 * num_people) if num_days > 0 else 80_000,
    )

    # ── 5b. BUILD TIME SLOTS ─────────────────────────────────────────────
    console.print("  Building time slots...")
    dep_date = trip.get("departure_date", "")
    daily_plan = build_daily_time_slots(
        daily_schedule=daily_schedule,
        food_map=food_map,
        num_days=num_days,
        destination=destination,
        departure_date=dep_date,
        combo_result=combo_result if combo_result.get("use_combo") else None,
    )
    console.print(f"  Time slots built: {len(daily_plan)} days")

    # ── 6. FINAL BUDGET RECAP ─────────────────────────────────────────────
    actual_food  = food_per_meal * 3 * num_days * num_people
    actual_total = spent_attr + actual_food

    console.print(f"  Activity total: {actual_total:,} / {activity_budget:,} VND "
                  f"({'[green]✓[/green]' if actual_total <= activity_budget else '[yellow]⚠[/yellow]'})")

    # Debug schedule
    if selected_attrs:
        schedule_str = describe_schedule(daily_schedule, food_map)
        console.print(f"[dim]{schedule_str}[/dim]")

    # ── 7. METRICS ────────────────────────────────────────────────────────
    full_day_count = sum(1 for a in selected_attrs if a.get("full_day"))
    food_unique_count = len(set(
        v["name"]
        for day_meals in food_map.values()
        for venues in day_meals.values()
        for v in venues[:1]  # only the assigned venue per meal
    ))
    # Avg travel per day: estimate travel between areas in each day
    day_travels = []
    for day_n, attrs in daily_schedule.items():
        if len(attrs) > 1:
            areas = [a.get("area", "center") for a in attrs]
            travel = sum(estimate_travel_min(areas[i], areas[i+1], destination)
                        for i in range(len(areas)-1))
            day_travels.append(travel)
    avg_travel = sum(day_travels) / len(day_travels) if day_travels else 0
    budget_util_pct = round(actual_total / max(activity_budget, 1) * 100)

    metrics = {
        "total_attractions": len(selected_attrs),
        "free_count": len(free_attrs),
        "paid_count": len(selected_attrs) - len(free_attrs),
        "total_food_venues": len(food_venues),
        "areas_used": list(clusters.keys()),
        "full_day_count": full_day_count,
        "avg_travel_per_day_min": round(avg_travel),
        "food_unique_count": food_unique_count,
        "budget_utilization_pct": budget_util_pct,
    }

    console.print("\n[bold]📊 DECISION ENGINE METRICS:[/bold]")
    console.print(f"  attractions_selected:  {len(selected_attrs)} ({len(free_attrs)} free)")
    console.print(f"  food_unique:           {food_unique_count}")
    console.print(f"  avg_travel_min/day:    {avg_travel:.0f}")
    console.print(f"  full_day_count:        {full_day_count}")
    console.print(f"  budget_utilization:    {budget_util_pct}%")

    # ── 8. PACK OUTPUT ────────────────────────────────────────────────────

    # Thông tin ngày 1 và ngày cuối (ảnh hưởng từ transport — user cung cấp)
    day1_arrival   = trip.get("day1_arrival_time", "")    # VD "17:00" nếu bay 15:00
    last_day_depart = trip.get("last_day_depart_time", "") # VD "05:30" nếu bay 08:00

    decisions = {
        # ── Attractions ──
        "selected_attractions":  selected_attrs,
        "attr_budget_used":      spent_attr,
        "clusters":              {k: v for k, v in clusters.items()},

        # ── Schedule ──
        "daily_schedule": {
            str(day_n): attrs
            for day_n, attrs in daily_schedule.items()
        },
        "daily_plan": daily_plan,  # list[DayPlan] with time slots

        # ── Combo ──
        "combo_result":   combo_result,
        "use_combo":      combo_result["use_combo"],
        "combo_summary":  combo_result.get("summary", ""),

        # ── Food ──
        "food_venues":    food_venues,
        "food_map": {
            str(day_n): meals
            for day_n, meals in food_map.items()
        },
        "food_per_meal_vnd":  food_per_meal,
        "food_budget_total":  food_budget,
        "food_actual_total":  actual_food,

        # ── Budget ──
        "activity_budget":    activity_budget,
        "activity_spent":     actual_total,
        "activity_remaining": activity_budget - actual_total,
        "within_activity_budget": actual_total <= activity_budget,

        # ── Schedule constraints từ transport ──
        "day1_arrival_time":   day1_arrival,
        "last_day_depart_time": last_day_depart,

        # ── Note cho user ──
        "hotel_note":     "Tự đặt hoặc hỏi Hotel Advisor để tối ưu",
        "transport_note": "Tự đặt hoặc hỏi Transport Advisor để so sánh flight/xe/tàu",

        # ── Metrics ──
        "metrics": metrics,
    }

    return {"decisions": decisions}


# ---------------------------------------------------------------------------
# Helper: build compact brief string cho Planner
# ---------------------------------------------------------------------------

def build_planner_brief(decisions: dict, trip: dict) -> str:
    """
    Convert decisions dict → compact brief string cho Planner.
    Uses time-annotated DayPlan output when available, otherwise falls back
    to the simpler text format.
    ~1,500-2,500 chars instead of 20,000 chars raw research.
    """
    # Use time-slot annotated brief if available
    daily_plan = decisions.get("daily_plan")
    if daily_plan:
        from app.utils.time_slots import build_brief_from_day_plans
        header = _build_brief_header(decisions, trip)
        brief_body = build_brief_from_day_plans(daily_plan, decisions)
        footer = _build_brief_footer(decisions)
        return header + "\n" + brief_body + "\n" + footer

    # Fallback: plain text brief (no time slots)
    return _build_plain_brief(decisions, trip)


def _build_brief_header(decisions: dict, trip: dict) -> str:
    """Common header for both brief formats."""
    activity_bud = decisions.get("activity_budget", 0)
    lines = [
        "=== BRIEF ĐÃ QUYẾT ĐỊNH (Python — không được thay đổi) ===\n",
        "📝 GHI CHÚ:",
        f"   Hotel: {decisions.get('hotel_note', 'user tự sắp xếp')}",
        f"   Transport: {decisions.get('transport_note', 'user tự sắp xếp')}",
        f"   Activity budget còn lại: {activity_bud:,} VND",
    ]
    if decisions.get("use_combo") and decisions.get("combo_result", {}).get("best_combo"):
        best = decisions["combo_result"]["best_combo"]
        lines += [
            "",
            "🎫 COMBO ĐÃ CHỌN (ưu tiên dùng):",
            f"   {best.combo.name} — {best.combo.price_total:,} VND",
            f"   Bao gồm: {', '.join(best.combo.includes[:4])}",
            f"   Benefits: {', '.join(best.combo.benefits[:3])}",
            f"   {decisions.get('combo_summary','')[:120]}",
        ]
    return "\n".join(lines)


def _build_brief_footer(decisions: dict) -> str:
    """Budget recap footer."""
    activity_bud = decisions.get("activity_budget", 0)
    lines = [
        "\n💰 ACTIVITY BUDGET RECAP:",
        f"   Tham quan: {decisions.get('attr_budget_used',0):,} VND",
        f"   Ăn uống ước tính: {decisions.get('food_actual_total',0):,} VND",
        f"   Tổng activity: {decisions.get('activity_spent',0):,} VND / {activity_bud:,} VND",
    ]
    if not decisions.get("within_activity_budget", True):
        lines.append("   ⚠️ Vượt activity budget — cân nhắc bỏ 1 điểm tham quan")
    return "\n".join(lines)


def _build_plain_brief(decisions: dict, trip: dict) -> str:
    """Legacy plain-text brief without time slots."""
    num_days     = trip.get("num_days", 4)
    num_people   = trip.get("num_people", 2)
    destination  = trip.get("destination", "")
    activity_bud = decisions.get("activity_budget", 0)
    dep_date     = trip.get("departure_date", "")

    lines: list[str] = [
        "=== BRIEF ĐÃ QUYẾT ĐỊNH (Python — không được thay đổi) ===\n"
    ]

    # Transport + Hotel note
    lines.append("📝 GHI CHÚ:")
    lines.append(f"   Hotel: {decisions.get('hotel_note', 'user tự sắp xếp')}")
    lines.append(f"   Transport: {decisions.get('transport_note', 'user tự sắp xếp')}")
    lines.append(f"   Activity budget còn lại: {activity_bud:,} VND\n")

    # Combo
    if decisions.get("use_combo") and decisions.get("combo_result", {}).get("best_combo"):
        best = decisions["combo_result"]["best_combo"]
        lines.append("🎫 COMBO ĐÃ CHỌN (ưu tiên dùng):")
        lines.append(f"   {best.combo.name} — {best.combo.price_total:,} VND")
        lines.append(f"   Bao gồm: {', '.join(best.combo.includes[:4])}")
        lines.append(f"   Benefits: {', '.join(best.combo.benefits[:3])}")
        lines.append(f"   {decisions.get('combo_summary','')[:120]}\n")

    # Daily schedule
    lines.append("🗓️ LỊCH THAM QUAN (đã phân công theo ngày và khu vực):")
    daily = decisions.get("daily_schedule", {})

    try:
        dep_dt = datetime.strptime(dep_date, "%Y-%m-%d")
    except ValueError:
        dep_dt = None

    for day_n in range(1, num_days + 1):
        attrs = daily.get(str(day_n), [])
        date_str = ""
        if dep_dt:
            d = dep_dt + timedelta(days=day_n - 1)
            date_str = f" ({d.strftime('%a %d/%m')})"

        if day_n == 1:
            arrival = decisions.get("day1_arrival_time", "")
            arrival_note = f" — đến ~{arrival}" if arrival else " — ngày di chuyển"
            lines.append(f"\n   Ngày 1{date_str}{arrival_note}:")
            if attrs:
                for a in attrs:
                    lines.append(f"     📍 {a['name']} — {a.get('address','')[:50]}")
                    price_label = "mien phi" if a.get("free") else f"{a.get('price_per_person',0):,} VND/nguoi"
                    lines.append(f"        Ve: {price_label} | {a.get('hours','')[:25]}")
            else:
                lines.append("     📍 Gần khách sạn — khám phá nhẹ (không đặt điểm xa)")
        elif day_n == num_days:
            depart = decisions.get("last_day_depart_time", "")
            depart_note = f" — rời lúc ~{depart}" if depart else " — check-out"
            lines.append(f"\n   Ngày {day_n}{date_str}{depart_note}:")
            if attrs:
                for a in attrs:
                    lines.append(f"     📍 {a['name']} (nhẹ, gần trung tâm)")
            else:
                lines.append("     📍 Mua quà / cafe sáng — sau đó ra sân bay/bến xe")
        else:
            lines.append(f"\n   Ngày {day_n}{date_str}:")
            if attrs:
                area_config = get_area_config(destination)
                prev_area = None
                for a in attrs:
                    area = a.get("area", "unknown")
                    # Travel estimate between consecutive attractions
                    if prev_area and prev_area != area:
                        travel_min = estimate_travel_min(prev_area, area, destination)
                        lines.append(f"        ↳ ~{travel_min} phút di chuyển")
                    prev_area = area

                    full_tag    = " [CẢ NGÀY — 07:00-17:00]" if a.get("full_day") else ""
                    outdoor_kws = ["beach", "biển", "island", "đảo", "nature", "thác", "suối", "núi"]
                    is_outdoor  = any(kw in (a.get("address","") + a.get("name","")).lower() for kw in outdoor_kws)
                    outdoor_tag = " [outdoor — chỉ 08:00-17:00]" if is_outdoor and not a.get("full_day") else ""
                    area_note   = area_config.get(area, {}).get("note", "")
                    area_tag    = f" [{area}]" + (f" — {area_note}" if area_note else "")

                    lines.append(f"     📍 {a['name']}{full_tag}{outdoor_tag}{area_tag}")
                    lines.append(f"        Địa chỉ: {a.get('address','(cần xác nhận)')[:60]}")
                    price_str = "miễn phí" if a.get("free") else f"{a.get('price_per_person',0):,} VND/người"
                    hours_str = a.get('hours', '')[:30] or "7:00-17:00"
                    lines.append(f"        Vé: {price_str} | Giờ: {hours_str}")
            else:
                lines.append("     📍 Tự do / nghỉ ngơi")

    # Food map
    lines.append("\n🍜 QUÁN ĂN THEO NGÀY (gần khu vực tham quan):")
    food_map = decisions.get("food_map", {})
    for day_n in range(1, num_days + 1):
        meals = food_map.get(str(day_n), {})
        lines.append(f"\n   Ngày {day_n}:")
        for meal_type, label in [("breakfast","Sáng"), ("lunch","Trưa"), ("dinner","Tối")]:
            venues = meals.get(meal_type, [])
            if venues:
                v = venues[0]
                price_str = v.get("price", "")[:40] if v.get("price") else f"~{decisions['food_per_meal_vnd']:,} VND/người"
                lines.append(
                    f"     {label}: {v['name']} — {v.get('address','')[:50]}\n"
                    f"            {price_str}"
                )
            else:
                lines.append(f"     {label}: Khu vực {destination} — quán local (~{decisions['food_per_meal_vnd']:,} VND/người)")

    # Budget recap
    lines.append("\n💰 ACTIVITY BUDGET RECAP:")
    lines.append(f"   Tham quan: {decisions.get('attr_budget_used',0):,} VND")
    lines.append(f"   Ăn uống ước tính: {decisions.get('food_actual_total',0):,} VND")
    lines.append(f"   Tổng activity: {decisions.get('activity_spent',0):,} VND / {activity_bud:,} VND")
    if not decisions.get("within_activity_budget", True):
        lines.append(f"   ⚠️ Vượt activity budget — cân nhắc bỏ 1 điểm tham quan")

    return "\n".join(lines)