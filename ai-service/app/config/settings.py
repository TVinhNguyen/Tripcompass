"""
Environment loading, LLM initialization, and API key configuration.
"""

import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

from langchain_nebius import ChatNebius
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

# LLM instances
llm           = ChatNebius(model="meta-llama/Llama-3.3-70B-Instruct", temperature=0)
extractor_llm = ChatNebius(model="meta-llama/Llama-3.3-70B-Instruct", temperature=0)

# Search tool
search_tool    = TavilySearch(max_results=5, name="web_search")
llm_with_tools = llm.bind_tools([search_tool])

# API keys
SERPAPI_KEY = os.environ.get("SERPAPI_API_KEY", "")
TODAY       = datetime.now().strftime("%B %d, %Y")

console.print(f"[green]System ready. Today: {TODAY}[/green]")
if SERPAPI_KEY:
    console.print("[green]SerpAPI key loaded.[/green]")
else:
    console.print("[yellow]⚠ SERPAPI_API_KEY not set — will fallback to Tavily for prices.[/yellow]")
