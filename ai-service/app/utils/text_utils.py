"""
Text/URL sanitization and source citation extraction utilities.
"""

import re
import json
from langchain_core.messages import ToolMessage

_MD_SPECIAL = re.compile(r'[`\[\]()!*_~|\\]')


def _sanitize_url(raw: str) -> str | None:
    url = raw.strip()
    if not re.match(r'^https?://', url, re.IGNORECASE):
        return None
    return url.split('#')[0].replace(' ', '%20')


def _sanitize_display(text: str) -> str:
    return _MD_SPECIAL.sub(lambda m: '\\' + m.group(0), text)


def _extract_source_urls(messages: list) -> list[str]:
    seen = {}
    for msg in messages:
        if not isinstance(msg, ToolMessage):
            continue
        raw = msg.content
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                continue
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, dict):
                    url = _sanitize_url(item.get("url", ""))
                    if url and url not in seen:
                        seen[url] = None
    return list(seen.keys())[:4]
