"""
tools/get_weather.py — WeatherAPI.com + static fallback.
"""
import json
import httpx
from langchain_core.tools import tool
from loguru import logger
from app import config

VIETNAM_CLIMATE: dict[str, dict[int, dict]] = {
    "da nang": {
        1:  {"condition": "cool, some rain", "temp_c": 21, "rain_chance": 40, "beach_ok": False},
        2:  {"condition": "mild, dry",       "temp_c": 22, "rain_chance": 20, "beach_ok": True},
        3:  {"condition": "warm, sunny",     "temp_c": 25, "rain_chance": 15, "beach_ok": True},
        4:  {"condition": "hot, sunny",      "temp_c": 28, "rain_chance": 15, "beach_ok": True},
        5:  {"condition": "hot, some rain",  "temp_c": 30, "rain_chance": 25, "beach_ok": True},
        6:  {"condition": "hot, humid",      "temp_c": 31, "rain_chance": 30, "beach_ok": True},
        7:  {"condition": "hot, humid",      "temp_c": 31, "rain_chance": 30, "beach_ok": True},
        8:  {"condition": "hot, humid",      "temp_c": 31, "rain_chance": 35, "beach_ok": True},
        9:  {"condition": "start of rainy",  "temp_c": 28, "rain_chance": 60, "beach_ok": False},
        10: {"condition": "heavy rain",      "temp_c": 25, "rain_chance": 75, "beach_ok": False},
        11: {"condition": "rainy, cool",     "temp_c": 23, "rain_chance": 65, "beach_ok": False},
        12: {"condition": "cool, some rain", "temp_c": 21, "rain_chance": 45, "beach_ok": False},
    },
    "hoi an": {
        4:  {"condition": "hot, sunny",  "temp_c": 28, "rain_chance": 15, "beach_ok": True},
        10: {"condition": "heavy rain",  "temp_c": 25, "rain_chance": 80, "beach_ok": False},
    },
}

_DEST_MAP = {
    "đà nẵng": "da nang", "da nang": "da nang", "danang": "da nang",
    "hội an": "hoi an", "hoi an": "hoi an",
}


def _weather_tip(rain_chance: int, temp_c: float) -> str:
    if rain_chance > 60:
        return "Mang theo áo mưa. Ưu tiên hoạt động trong nhà vào buổi chiều."
    if rain_chance > 30:
        return "Có thể có mưa rào buổi chiều. Lên kế hoạch outdoor vào sáng sớm."
    if temp_c > 32:
        return "Trời rất nóng. Tránh outdoor 11h-14h. Mang nước và kem chống nắng."
    return "Thời tiết đẹp. Phù hợp cho mọi hoạt động ngoài trời."


@tool
async def get_weather(destination: str, month: int) -> str:
    """Lấy thông tin thời tiết tại destination theo tháng.
    Trả về: nhiệt độ, tình trạng, xác suất mưa, có tắm biển được không.
    destination: tên tiếng Anh ('Da Nang', 'Nha Trang'). month: 1-12."""
    dest_key = _DEST_MAP.get(destination.lower().strip(), destination.lower().strip())

    if config.WEATHER_API_KEY and config.ENABLE_WEATHER:
        try:
            async with httpx.AsyncClient(timeout=config.TOOL_TIMEOUT) as client:
                resp = await client.get(
                    "https://api.weatherapi.com/v1/current.json",
                    params={"key": config.WEATHER_API_KEY, "q": destination, "aqi": "no"},
                )
                resp.raise_for_status()
                data = resp.json()
            current   = data.get("current", {})
            cond_text = (current.get("condition", {}) or {}).get("text", "")
            precip    = float(current.get("precip_mm", 0) or 0)
            rain      = 70 if precip > 2 else (40 if precip > 0 else 15)
            temp      = float(current.get("temp_c", 27) or 27)
            result    = {"success": True, "source": "weatherapi", "destination": destination,
                         "month": month, "temp_c": temp, "condition": cond_text,
                         "rain_chance": rain, "beach_ok": rain < 40, "tip": _weather_tip(rain, temp)}
            logger.info(f"[get_weather] {destination} m={month} → live API")
            return json.dumps(result, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"[get_weather] API failed: {e}, falling back to static")

    climate = VIETNAM_CLIMATE.get(dest_key, {}).get(
        month, {"condition": "unknown", "temp_c": 27, "rain_chance": 30, "beach_ok": True}
    )
    result = {"success": True, "source": "static", "destination": destination,
              "month": month, **climate, "tip": _weather_tip(climate["rain_chance"], climate["temp_c"])}
    logger.info(f"[get_weather] {destination} m={month} → static data")
    return json.dumps(result, ensure_ascii=False)
