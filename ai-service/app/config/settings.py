"""
Environment loading, LLM initialization, and API key configuration.
"""

import os
from pathlib import Path
from datetime import datetime
from typing import Any
from dotenv import load_dotenv

from langchain_nebius import ChatNebius
from langchain_openai import ChatOpenAI
from langchain_tavily import TavilySearch
from rich.console import Console

console = Console()


ENV_CANDIDATES = (
    Path(".env"),     # ai-service/.env (primary)
    Path("../.env"),  # tripcompass/.env
)


def _load_env() -> None:
    for env_path in ENV_CANDIDATES:
        if env_path.exists():
            load_dotenv(env_path, override=True)
            console.print(f"[green]Loaded .env: {env_path.resolve()}[/green]")
            return


_load_env()

os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
os.environ.setdefault("LANGCHAIN_PROJECT",    "Travel Agent v7")

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "nebius").strip().lower()
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0"))


def _get_env_first(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.environ.get(key)
        if value is not None and value.strip() != "":
            return value.strip()
    return default


def _default_model_for(provider: str) -> str:
    if provider == "nebius":
        return "meta-llama/llama-3.3-70b-instruct"
    if provider == "xiaomi":
        return "mimo-v2-pro"
    return "meta-llama/Llama-3.3-70B-Instruct"


def _resolve_model_for(provider: str, fallback_model: str | None = None) -> str:
    provider = (provider or "").strip().lower()

    if provider == "nebius":
        return _get_env_first(
            "LLM_MODEL_Nebius",
            "LLM_MODEL_NEBIUS",
            "LLM_MODEL_nebius",
            "LLM_MODEL",
            default=(fallback_model or _default_model_for(provider)),
        )

    if provider == "openrouter":
        return _get_env_first(
            "LLM_MODEL_Openrouter",
            "LLM_MODEL_OPENROUTER",
            "LLM_MODEL_openrouter",
            "LLM_MODEL",
            default=(fallback_model or _default_model_for(provider)),
        )

    if provider == "xiaomi":
        return _get_env_first(
            "LLM_MODEL_Xiaomi",
            "LLM_MODEL_XIAOMI",
            "LLM_MODEL_xiaomi",
            "LLM_MODEL",
            default=(fallback_model or _default_model_for(provider)),
        )

    return _get_env_first("LLM_MODEL", default=(fallback_model or _default_model_for(provider)))


def _build_llm(provider: str, model: str) -> Any:
    provider = (provider or "").strip().lower()

    if provider == "nebius":
        return ChatNebius(model=model, temperature=LLM_TEMPERATURE)

    if provider == "openrouter":
        api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter")

        base_url = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").strip()
        headers = {}
        referer = os.environ.get("OPENROUTER_HTTP_REFERER", "").strip()
        app_name = os.environ.get("OPENROUTER_APP_NAME", "Tripcompass").strip()
        if referer:
            headers["HTTP-Referer"] = referer
        if app_name:
            headers["X-Title"] = app_name

        return ChatOpenAI(
            model=model,
            temperature=LLM_TEMPERATURE,
            api_key=api_key,
            base_url=base_url,
            default_headers=headers or None,
        )

    if provider == "xiaomi":
        api_key = os.environ.get("XIAOMI_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("XIAOMI_API_KEY is required when LLM_PROVIDER=xiaomi")

        base_url = os.environ.get("XIAOMI_BASE_URL", "https://api.xiaomimimo.com/v1").strip()
        return ChatOpenAI(
            model=model,
            temperature=LLM_TEMPERATURE,
            api_key=api_key,
            base_url=base_url,
        )

    raise ValueError(f"Unsupported LLM_PROVIDER: {provider}. Use 'nebius', 'openrouter', or 'xiaomi'.")


LLM_MODEL = _resolve_model_for(LLM_PROVIDER)
EXTRACTOR_LLM_PROVIDER = os.environ.get("EXTRACTOR_LLM_PROVIDER", LLM_PROVIDER).strip().lower()
EXTRACTOR_LLM_MODEL = _get_env_first(
    "EXTRACTOR_LLM_MODEL",
    default=(LLM_MODEL if EXTRACTOR_LLM_PROVIDER == LLM_PROVIDER else _resolve_model_for(EXTRACTOR_LLM_PROVIDER)),
)

# LLM instances
llm = _build_llm(LLM_PROVIDER, LLM_MODEL)
extractor_llm = _build_llm(EXTRACTOR_LLM_PROVIDER, EXTRACTOR_LLM_MODEL)

# Search tool
search_tool    = TavilySearch(max_results=3, name="web_search")
llm_with_tools = llm.bind_tools([search_tool])

# API keys
SERPAPI_KEY = os.environ.get("SERPAPI_API_KEY", "")


def get_today() -> str:
    """Returns today's date formatted for prompts. Computed on each call to avoid stale dates."""
    return datetime.now().strftime("%B %d, %Y")


# Backward-compatible module-level constant (for imports that use TODAY directly)
# Use get_today() in prompts that may run across midnight.
TODAY = get_today()

console.print(f"[green]System ready. Today: {TODAY}[/green]")
console.print(
    f"[green]LLM provider: {LLM_PROVIDER} ({LLM_MODEL}) | "
    f"Extractor: {EXTRACTOR_LLM_PROVIDER} ({EXTRACTOR_LLM_MODEL})[/green]"
)
if SERPAPI_KEY:
    console.print("[green]SerpAPI key configured.[/green]")
else:
    console.print("[yellow]⚠ SERPAPI_API_KEY not set — will fallback to Tavily for prices.[/yellow]")
