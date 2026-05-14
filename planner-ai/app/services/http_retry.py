"""
services/http_retry.py — Shared httpx retry policy for external APIs.

Used by SerpAPI tools (hotels, flights, real-prices) and the weather tool.
Only transient network/server errors trigger a retry; client errors (400/401)
fail fast — retrying them just burns API quota.
"""
import httpx
from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500 or exc.response.status_code == 429
    return False


# Three tries total: ~1s + ~2s back-off. Total worst-case ≈ 4s on top of the
# per-request timeout — still inside the agent's tool budget.
transient_retry = retry(
    retry=retry_if_exception(_is_transient),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
    reraise=True,
)
