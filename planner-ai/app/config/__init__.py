"""
config — Backwards-compatible facade over the split config sub-modules.

Existing code uses two import patterns:
  • ``from app import config`` then ``config.X``  (data sources, tools, services)
  • ``from app.config import get_llm``            (agent.py, chat route)

This __init__.py re-exports everything from the sub-modules so both forms keep
working unchanged. When you add a new setting, drop it in the right sub-module
and append the name here — that's the only edit needed.

Import order matters: env.py must load .env BEFORE any module that reads
os.environ. Python import order is left-to-right, so env first.
"""
# 1. Bootstrap (.env load + LangSmith defaults). Must be first.
from .env import console  # noqa: F401

# 2. Static settings (no side effects beyond reading os.environ).
from .database import (  # noqa: F401
    DATABASE_URL,
    DB_SCHEMA,
    REDIS_URL,
    CACHE_TTL,
    CACHE_ADMIN_TOKEN,
)
from .external import (  # noqa: F401
    SERPAPI_KEY,
    WEATHER_API_KEY,
    TAVILY_API_KEY,
    ENABLE_HOTEL_SEARCH,
    ENABLE_FLIGHT_SEARCH,
    ENABLE_WEATHER,
    ENABLE_REAL_PRICES,
    ENABLE_WEB_SEARCH,
    WEB_SEARCH_MAX_RESULTS,
)
from .tuning import (  # noqa: F401
    MAX_TOOL_ROUNDS,
    TOOL_TIMEOUT,
    MAX_SCHEDULE_RETRIES,
    SCHEDULE_LLM_TIMEOUT,
    ENRICH_LLM_TIMEOUT,
    TODAY,
)

# 3. LLM (lazy — does not connect on import).
from .llm import (  # noqa: F401
    LLM_PROVIDER,
    LLM_MODEL,
    LLM_TEMPERATURE,
    LLM_REQUEST_TIMEOUT,
    LLM_MAX_RETRIES,
    USE_STRUCTURED_SCHEDULE,
    get_llm,
    llm,
)

# 4. Startup banner — print once when the package is first imported.
console.print(f"[green]Planner AI v2.0 ready. Today: {TODAY}[/green]")
console.print(f"[green]LLM: {LLM_PROVIDER} ({LLM_MODEL})[/green]")
if not SERPAPI_KEY:
    console.print("[yellow]⚠ SERPAPI_API_KEY not set — hotel/flight/price search disabled.[/yellow]")
if not WEATHER_API_KEY:
    console.print("[yellow]⚠ WEATHER_API_KEY not set — using static climate data.[/yellow]")
if ENABLE_WEB_SEARCH and not TAVILY_API_KEY:
    console.print("[yellow]⚠ TAVILY_API_KEY not set — web search tool disabled.[/yellow]")
