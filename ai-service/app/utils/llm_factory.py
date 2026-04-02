"""
LLM output helpers.
"""

from __future__ import annotations


def _to_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(x) for x in content)
    return str(content or "")
