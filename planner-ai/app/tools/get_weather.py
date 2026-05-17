"""
tools/get_weather.py — WeatherAPI.com + static fallback.
"""
import json

from langchain_core.tools import tool

from app.data_sources.weather import fetch_weather
from app.services.tool_cache import cached_tool


@tool
@cached_tool(ttl=1800)  # Weather data is even more stable — 30 min cache.
async def get_weather(destination: str, month: int) -> str:
    """Lấy thông tin thời tiết tại destination theo tháng.
    Trả về: nhiệt độ, tình trạng, xác suất mưa, có tắm biển được không.
    destination: tên tiếng Anh ('Da Nang', 'Nha Trang'). month: 1-12."""
    data = await fetch_weather(destination, month)
    return json.dumps(data, ensure_ascii=False)
