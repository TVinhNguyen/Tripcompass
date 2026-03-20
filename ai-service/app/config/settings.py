"""
Environment loading, LLM initialization, and API key configuration.
"""

import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

from langchain_nebius import ChatNebius
from langchain_openai import ChatOpenAI
from langchain_tavily import TavilySearch
from rich.console import Console

console = Console()

# Load .env — search multiple locations
_env_candidates = [
    Path(".env"),                              # ai-service/.env  (primary)
    Path("../.env"),                           # Tripcompass/.env
    Path("../../travel_Agent/.env"),           # repo root travel_Agent/.env
    Path("travel_Agent/.env"),                 # if run from repo root
]
for _p in _env_candidates:
    if _p.exists():
        load_dotenv(_p, override=True)
        console.print(f"[green]Loaded .env: {_p.resolve()}[/green]")
        break

os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
os.environ.setdefault("LANGCHAIN_PROJECT",    "Travel Agent v7")

LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "nebius").strip().lower()
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0"))


def _default_model_for(provider: str) -> str:
    if provider == "openrouter":
        return "meta-llama/llama-3.3-70b-instruct"
    return "meta-llama/Llama-3.3-70B-Instruct"


def _build_llm(provider: str, model: str):
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

    raise ValueError(f"Unsupported LLM_PROVIDER: {provider}. Use 'nebius' or 'openrouter'.")


LLM_MODEL = os.environ.get("LLM_MODEL", _default_model_for(LLM_PROVIDER)).strip()
EXTRACTOR_LLM_PROVIDER = os.environ.get("EXTRACTOR_LLM_PROVIDER", LLM_PROVIDER).strip().lower()
EXTRACTOR_LLM_MODEL = os.environ.get(
    "EXTRACTOR_LLM_MODEL",
    LLM_MODEL if EXTRACTOR_LLM_PROVIDER == LLM_PROVIDER else _default_model_for(EXTRACTOR_LLM_PROVIDER),
).strip()

# LLM instances
llm = _build_llm(LLM_PROVIDER, LLM_MODEL)
extractor_llm = _build_llm(EXTRACTOR_LLM_PROVIDER, EXTRACTOR_LLM_MODEL)

# Search tool
search_tool    = TavilySearch(max_results=5, name="web_search")
llm_with_tools = llm.bind_tools([search_tool])

# API keys
SERPAPI_KEY = os.environ.get("SERPAPI_API_KEY", "")
TODAY       = datetime.now().strftime("%B %d, %Y")

console.print(f"[green]System ready. Today: {TODAY}[/green]")
console.print(
    f"[green]LLM provider: {LLM_PROVIDER} ({LLM_MODEL}) | "
    f"Extractor: {EXTRACTOR_LLM_PROVIDER} ({EXTRACTOR_LLM_MODEL})[/green]"
)
if SERPAPI_KEY:
    console.print("[green]SerpAPI key loaded.[/green]")
else:
    console.print("[yellow]⚠ SERPAPI_API_KEY not set — will fallback to Tavily for prices.[/yellow]")
