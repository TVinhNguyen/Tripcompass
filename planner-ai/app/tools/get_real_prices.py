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

    try:
        async with httpx.AsyncClient(timeout=config.TOOL_TIMEOUT) as client:
            resp = await client.get("https://serpapi.com/search", params={
                "engine": "google", "q": f"giá vé {place_name} {destination} {datetime.now().year} {datetime.now().year + 1}",
                "hl": "vi", "gl": "vn", "api_key": config.SERPAPI_KEY,
            })
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"[get_real_prices] Error: {e}")
        return json.dumps({"success": False, "error": str(e), "price_updates": []})

    price_vnd = None
    answer = data.get("answer_box", {})
    if answer.get("answer"):
        m = re.search(r"([\d,\.]+)\s*(triệu|tr|k|nghìn|đồng|VND|đ)", answer["answer"], re.IGNORECASE)
        if m:
            raw, unit = m.group(1).replace(",", "").replace(".", ""), m.group(2).lower()
            try:
                val = int(raw)
                if "triệu" in unit or "tr" == unit:
                    price_vnd = val * 1_000_000
                elif "k" in unit or "nghìn" in unit:
                    price_vnd = val * 1_000
                else:
                    price_vnd = val
            except ValueError:
                pass

    if price_vnd:
        logger.info(f"[get_real_prices] {place_name} → {price_vnd:,}đ")
        return json.dumps({"success": True,
                           "price_updates": [{"place_id": place_id, "current_price": price_vnd}]})
    return json.dumps({"success": False, "error": "Could not parse price", "price_updates": []})
