"""
tools/get_real_prices.py — SerpAPI web search for real-time attraction prices.
"""
import json
import re
from datetime import datetime
import httpx
from langchain_core.tools import tool
from loguru import logger
from app import config
from app.services.http_retry import transient_retry


def _parse_vnd(text: str) -> int | None:
    """Parse a Vietnamese price string into VND.

    Handles: "150.000đ", "1.5 triệu", "1,5 triệu", "200k", "1500 VND".
    Strategy: keep the first numeric token (digits + at most one decimal mark),
    then scale by the unit suffix. Both `.` and `,` are accepted as decimal mark
    since Vietnamese usage varies; a number with multiple separators is treated
    as thousands grouping (e.g. "1.500.000" → 1500000.0).
    """
    if not text:
        return None
    m = re.search(
        r"(\d[\d.,]*)\s*(triệu|trieu|tr|k|nghìn|nghin|đồng|dong|vnd|đ|d)\b",
        text,
        re.IGNORECASE,
    )
    if not m:
        return None
    raw, unit = m.group(1), m.group(2).lower()

    # If both separators present → thousands grouping → strip all.
    # Else if a single separator with 1-2 trailing digits → decimal mark.
    if "." in raw and "," in raw:
        num_s = raw.replace(".", "").replace(",", "")
        try:
            val = float(num_s)
        except ValueError:
            return None
    else:
        sep = "." if "." in raw else ("," if "," in raw else "")
        if sep and len(raw.rsplit(sep, 1)[-1]) <= 2:
            val = float(raw.replace(",", "."))
        else:
            try:
                val = float(raw.replace(".", "").replace(",", ""))
            except ValueError:
                return None

    if unit in ("triệu", "trieu", "tr"):
        return int(val * 1_000_000)
    if unit in ("k", "nghìn", "nghin"):
        return int(val * 1_000)
    return int(val)


@tool
async def get_real_prices(
    place_name: str,
    destination: str,
    place_id: str,
) -> str:
    """Lấy giá vé thực tế từ web (real-time) cho 1 địa điểm cụ thể.
    Chỉ gọi khi is_stale=true hoặc giá không hợp lý."""
    if not config.ENABLE_REAL_PRICES or not config.SERPAPI_KEY:
        return json.dumps({"success": False, "error": "Real price check disabled", "price_updates": []})

    @transient_retry
    async def _fetch() -> dict:
        async with httpx.AsyncClient(timeout=config.TOOL_TIMEOUT) as client:
            resp = await client.get("https://serpapi.com/search", params={
                "engine": "google",
                "q": f"giá vé {place_name} {destination} {datetime.now().year} {datetime.now().year + 1}",
                "hl": "vi", "gl": "vn", "api_key": config.SERPAPI_KEY,
            })
            resp.raise_for_status()
            return resp.json()

    try:
        data = await _fetch()
    except Exception as e:
        logger.error(f"[get_real_prices] Error: {e}")
        return json.dumps({"success": False, "error": str(e), "price_updates": []})

    price_vnd = _parse_vnd(data.get("answer_box", {}).get("answer", ""))

    if price_vnd:
        logger.info(f"[get_real_prices] {place_name} → {price_vnd:,}đ")
        return json.dumps({"success": True,
                           "price_updates": [{"place_id": place_id, "current_price": price_vnd}]})
    return json.dumps({"success": False, "error": "Could not parse price", "price_updates": []})
