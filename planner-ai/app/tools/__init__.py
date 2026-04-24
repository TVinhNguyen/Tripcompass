"""
tools/__init__.py — Single registration point.

Every tool file exports a LangChain @tool directly.
ALL_TOOLS is the single source of truth used by the agent.
"""
from .get_places      import get_places
from .get_food_venues import get_food_venues
from .get_combos      import get_combos
from .get_weather     import get_weather
from .search_hotels   import search_hotels
from .search_flights  import search_flights
from .get_real_prices import get_real_prices
from .create_plan     import create_travel_plan

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
