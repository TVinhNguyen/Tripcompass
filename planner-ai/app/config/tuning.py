"""
config/tuning.py — Knobs that govern agent loop length, per-tool timeouts,
and schedule / enrich LLM call timeouts. Pure numbers; no side effects.
"""
import os
from datetime import datetime

# Hard cap on tool-calling rounds for one chat turn. LangGraph's default
# recursion_limit is 25, which is too generous for free-tier providers; we
# apply MAX_TOOL_ROUNDS * 2 + 1 at agent build time.
MAX_TOOL_ROUNDS = int(os.environ.get("MAX_TOOL_ROUNDS", "8"))

# Per-HTTP-call timeout for external tools (SerpAPI etc.). transient_retry
# wraps this so the worst case is ~3x with backoff.
TOOL_TIMEOUT = int(os.environ.get("TOOL_TIMEOUT_SECONDS", "5"))

# Default 1 retry (was 2). Combined with retryable filtering in node_validate,
# this caps worst-case schedule time at 2 LLM calls instead of 3 — and only
# retries when violations are truly retryable (HALLUCINATED_PLACE,
# CLOSED_HOURS, TIME_OVERLAP, …). Soft warnings never retry.
MAX_SCHEDULE_RETRIES = int(os.environ.get("MAX_SCHEDULE_RETRIES", "1"))

# Default 45s (was 90s) — fail fast and use the deterministic fallback rather
# than letting a flaky free-tier provider stall the whole pipeline.
SCHEDULE_LLM_TIMEOUT = int(os.environ.get("SCHEDULE_LLM_TIMEOUT_SECONDS", "45"))

# Enrichment is cosmetic (descriptions / tips). The chat path passes
# include_enrich=False so this only fires for /plan direct callers; keep it
# short (8s) so a slow LLM doesn't tank total /plan latency.
ENRICH_LLM_TIMEOUT = int(os.environ.get("ENRICH_LLM_TIMEOUT_SECONDS", "8"))

# Human-readable "today" injected into LLM prompts that benefit from current
# context. Captured at process boot; restart the service to roll over a day.
TODAY = datetime.now().strftime("%B %d, %Y")
