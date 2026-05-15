"""
tools/get_combos.py — Query combo packages from DB.
"""
import json

from langchain_core.tools import tool

from app.data_sources.combos import fetch_combos


@tool
async def get_combos(destination: str) -> str:
    """Lấy gói combo tour từ database.
    Trả về: tên, giá/người, bao gồm gì, số ngày.
    destination phải là tên lowercase tiếng Việt có dấu."""
    data = await fetch_combos(destination)
    return json.dumps(data, ensure_ascii=False)
