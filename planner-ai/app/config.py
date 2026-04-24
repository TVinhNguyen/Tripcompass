"""
Settings for planner-ai service.
Follows the same pattern as scraper-service/app/config/settings.py.
Supports multiple LLM providers: xiaomi / openrouter / nebius / anthropic / agentrouter / modal.
"""
import os
from pathlib import Path
from datetime import datetime
from typing import Any

from dotenv import load_dotenv
from loguru import logger
from rich.console import Console

console = Console()

# ── Load .env (same pattern as scraper-service) ───────────────────────────────
_ENV_CANDIDATES = (Path(".env"), Path("../.env"))

def _load_env() -> None:
    for env_path in _ENV_CANDIDATES:
        if env_path.exists():
            load_dotenv(env_path, override=False)
            console.print(f"[green]Loaded .env: {env_path.resolve()}[/green]")
            return

_load_env()

# ── LangSmith tracing (same as scraper-service) ───────────────────────────────
os.environ.setdefault("LANGCHAIN_TRACING_V2", os.environ.get("LANGCHAIN_TRACING_V2", "true"))
os.environ.setdefault("LANGCHAIN_PROJECT", os.environ.get("LANGCHAIN_PROJECT", "Planner AI"))


# ── LLM Provider config ───────────────────────────────────────────────────────
LLM_PROVIDER    = os.environ.get("LLM_PROVIDER", "xiaomi").strip().lower()
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0"))


def _get_env_first(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.environ.get(key)
        if value is not None and value.strip():
            return value.strip()
    return default


def _default_model_for(provider: str) -> str:
    defaults = {
        "xiaomi":       "mimo-v2-pro",
        "openrouter":   "qwen/qwen3.6-plus:free",
        "nebius":       "meta-llama/llama-3.3-70b-instruct",
        "anthropic":    "claude-sonnet-4-20250514",
        "agentrouter":  "deepseek-v3.2",
        "modal":        "zai-org/GLM-5.1-FP8",
    }
    return defaults.get(provider, "mimo-v2-pro")


def _resolve_model(provider: str) -> str:
    p = (provider or "").strip().lower()
    if p == "xiaomi":
        return _get_env_first("LLM_MODEL_Xiaomi", "LLM_MODEL_XIAOMI", "LLM_MODEL",
                              default=_default_model_for(p))
    if p == "openrouter":
        return _get_env_first("LLM_MODEL_Openrouter", "LLM_MODEL_OPENROUTER", "LLM_MODEL",
                              default=_default_model_for(p))
    if p == "nebius":
        return _get_env_first("LLM_MODEL_Nebius", "LLM_MODEL_NEBIUS", "LLM_MODEL",
                              default=_default_model_for(p))
    if p == "anthropic":
        return _get_env_first("LLM_MODEL_Anthropic", "LLM_MODEL_ANTHROPIC", "LLM_MODEL",
                              default=_default_model_for(p))
    if p == "agentrouter":
        return _get_env_first("LLM_MODEL_AgentRouter", "LLM_MODEL_AGENTROUTER", "LLM_MODEL",
                              default=_default_model_for(p))
    if p == "modal":
        return _get_env_first("LLM_MODEL_Modal", "LLM_MODEL_MODAL", "LLM_MODEL",
                              default=_default_model_for(p))
    return _get_env_first("LLM_MODEL", default=_default_model_for(p))


def _build_llm(provider: str, model: str) -> Any:
    """Build a LangChain chat model for the given provider."""
    p = (provider or "").strip().lower()

    if p == "xiaomi":
        from langchain_openai import ChatOpenAI
        api_key  = os.environ.get("XIAOMI_API_KEY", "").strip()
        base_url = os.environ.get("XIAOMI_BASE_URL", "https://api.xiaomimimo.com/v1").strip()
        if not api_key:
            raise RuntimeError("XIAOMI_API_KEY required when LLM_PROVIDER=xiaomi")
        return ChatOpenAI(model=model, temperature=LLM_TEMPERATURE,
                          api_key=api_key, base_url=base_url)

    if p == "openrouter":
        from langchain_openai import ChatOpenAI
        api_key  = os.environ.get("OPENROUTER_API_KEY", "").strip()
        base_url = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").strip()
        headers  = {}
        if referer := os.environ.get("OPENROUTER_HTTP_REFERER", "").strip():
            headers["HTTP-Referer"] = referer
        if app_name := os.environ.get("OPENROUTER_APP_NAME", "Tripcompass Planner").strip():
            headers["X-Title"] = app_name
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY required when LLM_PROVIDER=openrouter")
        return ChatOpenAI(model=model, temperature=LLM_TEMPERATURE,
                          api_key=api_key, base_url=base_url,
                          default_headers=headers or None)

    if p == "nebius":
        from langchain_nebius import ChatNebius
        return ChatNebius(model=model, temperature=LLM_TEMPERATURE)

    if p == "anthropic":
        from langchain_anthropic import ChatAnthropic
        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY required when LLM_PROVIDER=anthropic")
        return ChatAnthropic(model=model, temperature=LLM_TEMPERATURE, api_key=api_key)

    if p == "agentrouter":
        from langchain_openai import ChatOpenAI
        api_key  = os.environ.get("AGENTROUTER_API_KEY", "").strip()
        base_url = os.environ.get("AGENTROUTER_BASE_URL", "https://agentrouter.org/v1").strip()
        if not api_key:
            raise RuntimeError("AGENTROUTER_API_KEY required when LLM_PROVIDER=agentrouter")
        return ChatOpenAI(model=model, temperature=LLM_TEMPERATURE,
                          api_key=api_key, base_url=base_url)

    if p == "modal":
        from langchain_openai import ChatOpenAI
        api_key  = os.environ.get("MODAL_API_KEY", "").strip()
        base_url = os.environ.get("MODAL_BASE_URL", "https://api.us-west-2.modal.direct/v1").strip()
        if not api_key:
            raise RuntimeError("MODAL_API_KEY required when LLM_PROVIDER=modal")
        return ChatOpenAI(model=model, temperature=LLM_TEMPERATURE,
                          api_key=api_key, base_url=base_url)

    raise ValueError(f"Unsupported LLM_PROVIDER: '{provider}'. "
                     f"Use xiaomi/openrouter/nebius/anthropic/agentrouter/modal.")


# ── Build LLM instance ────────────────────────────────────────────────────────
LLM_MODEL = _resolve_model(LLM_PROVIDER)
llm       = _build_llm(LLM_PROVIDER, LLM_MODEL)

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@postgres:5432/tripcompass"
)
DB_SCHEMA = os.environ.get("DB_SCHEMA", "schema_travel")

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL       = os.environ.get("REDIS_URL", "redis://redis:6379")
CACHE_TTL       = int(os.environ.get("CACHE_TTL_SECONDS", "3600"))

# ── External APIs ─────────────────────────────────────────────────────────────
SERPAPI_KEY     = os.environ.get("SERPAPI_API_KEY", "")
WEATHER_API_KEY = os.environ.get("WEATHER_API_KEY", "")

# ── Feature flags ─────────────────────────────────────────────────────────────
ENABLE_HOTEL_SEARCH   = os.environ.get("ENABLE_HOTEL_SEARCH",    "true").lower() == "true"
ENABLE_FLIGHT_SEARCH  = os.environ.get("ENABLE_FLIGHT_SEARCH",   "false").lower() == "true"
ENABLE_WEATHER        = os.environ.get("ENABLE_WEATHER",          "true").lower() == "true"
ENABLE_REAL_PRICES    = os.environ.get("ENABLE_REAL_PRICE_CHECK", "true").lower() == "true"

# ── Tuning ────────────────────────────────────────────────────────────────────
MAX_TOOL_ROUNDS       = int(os.environ.get("MAX_TOOL_ROUNDS",         "8"))
TOOL_TIMEOUT          = int(os.environ.get("TOOL_TIMEOUT_SECONDS",    "5"))
MAX_SCHEDULE_RETRIES  = int(os.environ.get("MAX_SCHEDULE_RETRIES",    "2"))

TODAY = datetime.now().strftime("%B %d, %Y")

console.print(f"[green]Planner AI v2.0 ready. Today: {TODAY}[/green]")
console.print(f"[green]LLM: {LLM_PROVIDER} ({LLM_MODEL})[/green]")
if not SERPAPI_KEY:
    console.print("[yellow]⚠ SERPAPI_API_KEY not set — hotel/flight/price search disabled.[/yellow]")
if not WEATHER_API_KEY:
    console.print("[yellow]⚠ WEATHER_API_KEY not set — using static climate data.[/yellow]")

