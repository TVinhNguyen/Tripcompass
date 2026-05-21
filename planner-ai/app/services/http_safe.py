"""
services/http_safe.py — Redact API keys from error strings before they reach
client responses or shared log streams.

`httpx.HTTPStatusError.__str__()` embeds the full request URL, which for
SerpAPI/WeatherAPI/Tavily includes `?api_key=…` as a query parameter. Naive
`str(e)` propagation has already been seen leaking real keys back to the chat
client. This helper is the single shared sanitizer.
"""
from __future__ import annotations

import re

# Match common secret-bearing query params (api_key, key, access_token, token)
# up to the next & / whitespace / closing quote / paren.
_REDACT_PATTERN = re.compile(
    r"(api_key|access_token|token|appid|key)=([^&\s'\"\)]+)",
    re.IGNORECASE,
)


def redact(text: str) -> str:
    """Replace the value of every secret-shaped query param with REDACTED.
    Preserves the param name so logs still indicate which key was involved."""
    if not text:
        return text
    return _REDACT_PATTERN.sub(r"\1=REDACTED", text)
