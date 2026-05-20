"""
tools/web_search.py — Tavily web search for the chat agent.

Use case: when the curated DB has no entry for a place the user asks about,
or when the user wants info that falls outside the DB schema (festivals,
seasonal events, fresh advisories). Read-only — never writes back to the DB.
Admin moderation of imported places happens via /admin/places UI separately.

Output mirrors other tools: JSON string the agent can summarize. Tavily SDK
is synchronous; we run it in a thread to keep the event loop responsive.
"""
from __future__ import annotations

import asyncio
import json
from typing import Literal, Optional

from langchain_core.tools import tool
from loguru import logger

from app import config
from app.services.tool_cache import cached_tool

# Lazy-init so a missing TAVILY_API_KEY at import time doesn't crash the
# whole planner-ai process — the tool returns a graceful "disabled" payload.
_tavily = None


def _get_client():
    """Return a cached TavilySearch client or None if not configured."""
    global _tavily
    if _tavily is not None:
        return _tavily
    if not (config.ENABLE_WEB_SEARCH and config.TAVILY_API_KEY):
        return None
    try:
        # Imported lazily so installs without langchain-tavily still boot
        # (the dep is in requirements.txt but feature stays optional).
        from langchain_tavily import TavilySearch  # type: ignore
        _tavily = TavilySearch(
            max_results=config.WEB_SEARCH_MAX_RESULTS,
            name="web_search",
            tavily_api_key=config.TAVILY_API_KEY,
        )
        return _tavily
    except Exception as exc:
        logger.error(f"[web_search] failed to init Tavily client: {exc}")
        return None


def _format_results(raw) -> list[dict]:
    """Tavily returns either a list of result dicts or a dict with 'results'.
    Normalise to a flat list of {title, url, content, score}."""
    items = []
    if isinstance(raw, dict):
        items = raw.get("results", []) or []
    elif isinstance(raw, list):
        items = raw
    cleaned = []
    for r in items:
        if not isinstance(r, dict):
            continue
        cleaned.append({
            "title":   (r.get("title") or "").strip(),
            "url":     r.get("url") or "",
            "content": (r.get("content") or r.get("snippet") or "").strip()[:600],
            "score":   r.get("score"),
        })
    return cleaned


@tool
@cached_tool(ttl=3600)  # Web data rarely shifts within an hour; saves Tavily quota.
async def web_search(
    query: str,
    scope: Optional[Literal["place", "event", "general"]] = "general",
) -> str:
    """Tìm thông tin du lịch Việt Nam từ web khi DB không có dữ liệu phù hợp.

    Khi nào dùng:
    - Sau khi gọi get_places / get_food_venues mà kết quả rỗng cho địa điểm user hỏi.
    - User hỏi sự kiện / lễ hội / cập nhật theo mùa không có trong DB.
    - User muốn AI tìm hiểu thêm về 1 địa điểm cụ thể chưa có trong hệ thống.

    Lưu ý: Kết quả CHỈ để tham khảo — KHÔNG được dùng làm tham số create_travel_plan
    (planner chỉ chấp nhận place_id từ DB). Nếu user muốn import, hướng dẫn liên hệ
    admin.

    Args:
        query: câu hỏi cụ thể bằng tiếng Việt hoặc tiếng Anh. Càng cụ thể càng tốt.
        scope: "place" = địa điểm/quán ăn cụ thể; "event" = sự kiện/lễ hội/mùa;
               "general" = thông tin chung.
    """
    if not (config.ENABLE_WEB_SEARCH and config.TAVILY_API_KEY):
        return json.dumps({
            "success": False,
            "error": "Web search disabled (set TAVILY_API_KEY to enable)",
            "results": [],
        }, ensure_ascii=False)

    client = _get_client()
    if client is None:
        return json.dumps({
            "success": False,
            "error": "Web search client unavailable",
            "results": [],
        }, ensure_ascii=False)

    # Bias the query toward Vietnam travel context. Tavily's relevance scoring
    # benefits more from explicit context terms than from include_domains
    # filtering (which can over-restrict and return empty).
    scope_prefix = {
        "place":   "Vietnam travel place info:",
        "event":   "Vietnam tourism event or festival:",
        "general": "Vietnam travel:",
    }.get(scope or "general", "Vietnam travel:")
    enriched_query = f"{scope_prefix} {query.strip()}"

    try:
        raw = await asyncio.to_thread(client.invoke, {"query": enriched_query})
    except Exception as exc:
        logger.error(f"[web_search] Tavily call failed: {exc}")
        return json.dumps({
            "success": False,
            "error": f"Web search failed: {exc}",
            "results": [],
        }, ensure_ascii=False)

    results = _format_results(raw)
    logger.info(f"[web_search] scope={scope} query={query!r} → {len(results)} results")
    return json.dumps({
        "success": True,
        "query": query,
        "scope": scope,
        "count": len(results),
        "results": results,
    }, ensure_ascii=False)
