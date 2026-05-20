"""
tools/__init__.py — Single registration point.

Every tool file exports a LangChain @tool directly.
ALL_TOOLS is the single source of truth used by the agent.
"""
from app import config

from .get_places      import get_places
from .get_food_venues import get_food_venues
from .get_combos      import get_combos
from .get_weather     import get_weather
from .search_hotels   import search_hotels
from .search_flights  import search_flights
from .get_real_prices import get_real_prices
from .create_plan     import create_travel_plan
from .web_search      import web_search

ALL_TOOLS = [
    get_places,
    get_food_venues,
    get_combos,
    get_weather,
    search_hotels,
    search_flights,
    get_real_prices,
    create_travel_plan,
]

# Only expose web_search when the flag + key are both present. Registering a
# permanently-disabled tool would still consume an LLM tool slot and tempt the
# agent into calling it just to get the "disabled" error back.
if config.ENABLE_WEB_SEARCH and config.TAVILY_API_KEY:
    ALL_TOOLS.append(web_search)
