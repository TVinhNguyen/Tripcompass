"""
config/env.py — Bootstraps `.env` loading + the shared rich console.

Imported FIRST (transitively, via __init__.py) so every other config module
can safely call os.environ.get(...). Setting LANGCHAIN_TRACING_V2 defaults
here keeps the startup banner clean when LANGCHAIN_API_KEY isn't set.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console

console = Console()

_ENV_CANDIDATES = (Path(".env"), Path("../.env"))


def _load_env() -> None:
    for env_path in _ENV_CANDIDATES:
        if env_path.exists():
            load_dotenv(env_path, override=False)
            console.print(f"[green]Loaded .env: {env_path.resolve()}[/green]")
            return


_load_env()

# LangSmith tracing — off by default so the service starts without a
# LANGCHAIN_API_KEY. Set LANGCHAIN_TRACING_V2=true to enable.
os.environ.setdefault("LANGCHAIN_TRACING_V2", "false")
os.environ.setdefault("LANGCHAIN_PROJECT", "Planner AI")
