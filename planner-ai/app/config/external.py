"""
config/external.py — API keys + feature flags for the third-party services
the chat agent can reach: SerpAPI (hotels/flights/real prices), WeatherAPI,
Tavily (web search fallback).

Feature flags are intentionally simple booleans — they let prod ops disable
a tool without code changes when a vendor outage / quota event hits.
"""
import os

# ── API keys ─────────────────────────────────────────────────────────────────
SERPAPI_KEY     = os.environ.get("SERPAPI_API_KEY", "")
WEATHER_API_KEY = os.environ.get("WEATHER_API_KEY", "")
TAVILY_API_KEY  = os.environ.get("TAVILY_API_KEY",  "")

# ── Feature flags ────────────────────────────────────────────────────────────
ENABLE_HOTEL_SEARCH  = os.environ.get("ENABLE_HOTEL_SEARCH",    "true").lower() == "true"
ENABLE_FLIGHT_SEARCH = os.environ.get("ENABLE_FLIGHT_SEARCH",   "false").lower() == "true"
ENABLE_WEATHER       = os.environ.get("ENABLE_WEATHER",         "true").lower() == "true"
ENABLE_REAL_PRICES   = os.environ.get("ENABLE_REAL_PRICE_CHECK","true").lower() == "true"

# Web search is the only tool that goes outside the curated DB / SerpAPI flows.
# Keep it gated so a missing key surfaces as "disabled" rather than runtime 500.
ENABLE_WEB_SEARCH = os.environ.get("ENABLE_WEB_SEARCH", "true").lower() == "true"

# Per-call cap. Tavily free tier = 1000 searches/month; with cached_tool TTL
# the agent only burns budget on genuinely new queries.
WEB_SEARCH_MAX_RESULTS = int(os.environ.get("WEB_SEARCH_MAX_RESULTS", "5"))
