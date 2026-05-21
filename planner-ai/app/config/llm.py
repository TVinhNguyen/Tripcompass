"""
config/llm.py — LLM provider selection, credential lookup, and lazy
client construction.

The plan-AI pipeline supports multiple OpenAI-compatible gateways (NVIDIA NIM,
OpenRouter, Xiaomi, AgentRouter, Modal) plus first-party SDKs (Google AI
Studio, Ollama, Nebius, Anthropic). The actual LangChain client is built
lazily on first get_llm() call so the module imports cleanly even when the
chosen provider's API key is missing — useful for tests / lint / health
checks before secrets are wired up. The first real request fails loudly with
the canonical "X_API_KEY required when LLM_PROVIDER=…" error.
"""
import os
from typing import Any

# ── Provider selection ───────────────────────────────────────────────────────
LLM_PROVIDER    = os.environ.get("LLM_PROVIDER", "google").strip().lower()
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0"))

# Free-tier providers (NVIDIA NIM, OpenRouter free models) frequently close
# long streams mid-token. These knobs keep the OpenAI-compatible clients alive
# under that flakiness:
#   request_timeout — drop a hung request instead of blocking the agent forever
#   max_retries     — retry transient HTTP / RemoteProtocolError before giving up
LLM_REQUEST_TIMEOUT = float(os.environ.get("LLM_REQUEST_TIMEOUT", "60"))
LLM_MAX_RETRIES     = int(os.environ.get("LLM_MAX_RETRIES", "3"))

# When true, the schedule node asks the LLM via function-calling so the
# response is guaranteed-shaped JSON. Off by default because not every
# provider (minimax on NVIDIA NIM in particular) advertises tool-use
# compatibility — leave off unless you've verified your provider supports
# `with_structured_output`.
USE_STRUCTURED_SCHEDULE = os.environ.get("USE_STRUCTURED_SCHEDULE", "false").lower() == "true"


def _openai_compat_kwargs() -> dict:
    """Shared kwargs for every ChatOpenAI-compatible client.

    streaming=True is explicit so the provider sees `stream: true` in the
    request body. Without it some OpenAI-compatible gateways (NVIDIA NIM,
    self-hosted proxies) silently buffer the response — astream_events then
    fires a single on_chat_model_end with the whole text, and the frontend
    appears to "not stream".
    """
    return {
        "temperature":     LLM_TEMPERATURE,
        "request_timeout": LLM_REQUEST_TIMEOUT,
        "max_retries":     LLM_MAX_RETRIES,
        "streaming":       True,
    }


def _get_env_first(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.environ.get(key)
        if value is not None and value.strip():
            return value.strip()
    return default


def _default_model_for(provider: str) -> str:
    defaults = {
        "google":       "gemma-4-31b-it",
        "ollama":       "gemma4:31b-cloud",
        "xiaomi":       "mimo-v2-pro",
        "nvidia":       "minimaxai/minimax-m2.7",
        "openrouter":   "google/gemma-4-31b-it:free",
        "nebius":       "meta-llama/llama-3.3-70b-instruct",
        "anthropic":    "claude-sonnet-4-20250514",
        "agentrouter":  "deepseek-v3.2",
        "modal":        "zai-org/GLM-5.1-FP8",
    }
    return defaults.get(provider, "gemma-4-31b-it")


def _provider_credentials(provider: str) -> tuple[str, str, dict[str, str]]:
    """Return (api_key, api_base, extra_headers) for the given provider."""
    p = (provider or "").strip().lower()
    headers: dict[str, str] = {}

    if p == "google":
        # Google AI Studio uses GOOGLE_API_KEY (canonical) but also accepts
        # the legacy GEMINI_API_KEY. base_url is empty — ChatGoogleGenerativeAI
        # routes through generativelanguage.googleapis.com automatically.
        api_key = (
            os.environ.get("GOOGLE_API_KEY", "").strip()
            or os.environ.get("GEMINI_API_KEY", "").strip()
        )
        return (api_key, "", headers)
    if p == "ollama":
        # Ollama daemon — no API key (cloud auth lives in the daemon's SSH
        # key store via `ollama signin`). base_url points at the daemon HTTP
        # endpoint; for `:cloud` model tags the daemon proxies to Ollama
        # Cloud, so the request still leaves the host.
        return (
            "",
            os.environ.get("OLLAMA_BASE_URL", "http://host.docker.internal:11434").strip(),
            headers,
        )
    if p == "xiaomi":
        return (
            os.environ.get("XIAOMI_API_KEY", "").strip(),
            os.environ.get("XIAOMI_BASE_URL", "https://api.xiaomimimo.com/v1").strip(),
            headers,
        )
    if p == "nvidia":
        return (
            os.environ.get("NVIDIA_API_KEY", "").strip(),
            os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").strip(),
            headers,
        )
    if p == "openrouter":
        if referer := os.environ.get("OPENROUTER_HTTP_REFERER", "").strip():
            headers["HTTP-Referer"] = referer
        if app_name := os.environ.get("OPENROUTER_APP_NAME", "Tripcompass Planner").strip():
            headers["X-Title"] = app_name
        return (
            os.environ.get("OPENROUTER_API_KEY", "").strip(),
            os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").strip(),
            headers,
        )
    if p == "nebius":
        return (os.environ.get("NEBIUS_API_KEY", "").strip(), "", headers)
    if p == "anthropic":
        return (os.environ.get("ANTHROPIC_API_KEY", "").strip(), "", headers)
    if p == "agentrouter":
        return (
            os.environ.get("AGENTROUTER_API_KEY", "").strip(),
            os.environ.get("AGENTROUTER_BASE_URL", "https://agentrouter.org/v1").strip(),
            headers,
        )
    if p == "modal":
        return (
            os.environ.get("MODAL_API_KEY", "").strip(),
            os.environ.get("MODAL_BASE_URL", "https://api.us-west-2.modal.direct/v1").strip(),
            headers,
        )
    return ("", "", headers)


def _require_api_key(provider: str, api_key: str) -> None:
    # Ollama daemon doesn't use API keys — auth is handled out-of-band by
    # `ollama signin` on the host. Skip the check entirely.
    if provider == "ollama":
        return
    if not api_key:
        key_names = {
            "google": "GOOGLE_API_KEY",
            "xiaomi": "XIAOMI_API_KEY",
            "nvidia": "NVIDIA_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
            "nebius": "NEBIUS_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "agentrouter": "AGENTROUTER_API_KEY",
            "modal": "MODAL_API_KEY",
        }
        key_name = key_names.get(provider, f"{provider.upper()}_API_KEY")
        raise RuntimeError(f"{key_name} required when LLM_PROVIDER={provider}")


def _resolve_model(provider: str) -> str:
    p = (provider or "").strip().lower()
    # Per-provider env var precedence: TitleCase legacy → SCREAMING canonical → generic LLM_MODEL.
    bucket = {
        "google":      ("LLM_MODEL_Google",      "LLM_MODEL_GOOGLE"),
        "ollama":      ("LLM_MODEL_Ollama",      "LLM_MODEL_OLLAMA"),
        "xiaomi":      ("LLM_MODEL_Xiaomi",      "LLM_MODEL_XIAOMI"),
        "nvidia":      ("LLM_MODEL_Nvidia",      "LLM_MODEL_NVIDIA"),
        "openrouter":  ("LLM_MODEL_Openrouter",  "LLM_MODEL_OPENROUTER"),
        "nebius":      ("LLM_MODEL_Nebius",      "LLM_MODEL_NEBIUS"),
        "anthropic":   ("LLM_MODEL_Anthropic",   "LLM_MODEL_ANTHROPIC"),
        "agentrouter": ("LLM_MODEL_AgentRouter", "LLM_MODEL_AGENTROUTER"),
        "modal":       ("LLM_MODEL_Modal",       "LLM_MODEL_MODAL"),
    }
    keys = bucket.get(p, ())
    return _get_env_first(*keys, "LLM_MODEL", default=_default_model_for(p))


def _build_llm(provider: str, model: str) -> Any:
    """Build a LangChain chat model for the given provider."""
    p = (provider or "").strip().lower()

    if p == "google":
        # Google AI Studio (Gemini API) — serves both Gemini and Gemma models
        # via generativelanguage.googleapis.com. ChatGoogleGenerativeAI uses
        # different param names than ChatOpenAI: timeout (not request_timeout),
        # disable_streaming (default False, so streaming is on).
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key, _base_url, _headers = _provider_credentials(p)
        _require_api_key(p, api_key)
        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            temperature=LLM_TEMPERATURE,
            timeout=LLM_REQUEST_TIMEOUT,
            max_retries=LLM_MAX_RETRIES,
        )

    if p == "ollama":
        # Talks to a local Ollama daemon (or `:cloud` model tags that the
        # daemon proxies to Ollama Cloud). No API key — `ollama signin` on
        # the host handles cloud auth via SSH key. Tool-calling support
        # depends on the model: gemma2/3 are unreliable, llama3.1+ works.
        # If the agent loops without calling tools, switch back to google.
        from langchain_ollama import ChatOllama
        _api_key, base_url, _headers = _provider_credentials(p)
        return ChatOllama(
            model=model,
            base_url=base_url,
            temperature=LLM_TEMPERATURE,
            # ChatOllama streams by default; no `streaming=True` flag needed.
        )

    if p == "nebius":
        from langchain_nebius import ChatNebius
        return ChatNebius(model=model, temperature=LLM_TEMPERATURE)

    if p == "anthropic":
        from langchain_anthropic import ChatAnthropic
        api_key, _base_url, _headers = _provider_credentials(p)
        _require_api_key(p, api_key)
        return ChatAnthropic(model=model, temperature=LLM_TEMPERATURE, api_key=api_key)

    # All remaining providers (xiaomi/nvidia/openrouter/agentrouter/modal)
    # expose an OpenAI-compatible REST API → one ChatOpenAI build path.
    if p in {"xiaomi", "nvidia", "openrouter", "agentrouter", "modal"}:
        from langchain_openai import ChatOpenAI
        api_key, base_url, headers = _provider_credentials(p)
        _require_api_key(p, api_key)
        return ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url=base_url,
            default_headers=headers or None,
            **_openai_compat_kwargs(),
        )

    raise ValueError(
        f"Unsupported LLM_PROVIDER: '{provider}'. Use one of "
        "google/ollama/xiaomi/nvidia/openrouter/nebius/anthropic/agentrouter/modal."
    )


# ── Lazy LLM instance ───────────────────────────────────────────────────────
LLM_MODEL = _resolve_model(LLM_PROVIDER)
_llm_instance: Any | None = None


def get_llm() -> Any:
    """Return the configured LangChain chat model, building it on first call."""
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = _build_llm(LLM_PROVIDER, LLM_MODEL)
    return _llm_instance


class _LazyLLM:
    """Proxy that builds the real LLM on first attribute access.

    Existing call sites use ``config.llm.ainvoke(...)`` — this preserves that
    shape without forcing eager construction. New code should call get_llm()
    directly.
    """

    def __getattr__(self, name: str):
        return getattr(get_llm(), name)


llm = _LazyLLM()
