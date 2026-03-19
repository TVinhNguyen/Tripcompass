"""
Pipeline state definitions: TripRequirements, ResearchResults, BudgetBreakdown, TravelPipelineState.
"""

from typing import Annotated, TypedDict
from langgraph.graph.message import AnyMessage, add_messages


class TripRequirements(TypedDict, total=False):
    destination:         str
    origin:              str
    departure_date:      str
    return_date:         str
    num_people:          int
    budget_vnd:          int
    travel_style:        str
    special_requests:    str
    destination_context: str
    num_nights:          int
    num_days:            int


class ResearchResults(TypedDict, total=False):
    attractions: str
    food:        str
    hotels:      str
    combos:      str
    transport:   str


def merge_dict(left: dict, right: dict) -> dict:
    if not left:
        return right.copy() if right else {}
    merged = left.copy()
    if right:
        merged.update(right)
    return merged


class BudgetBreakdown(TypedDict, total=False):
    hotel_per_night_vnd:     int
    total_hotel_vnd:         int
    attractions_total_vnd:   int
    food_per_day_vnd:        int
    total_food_vnd:          int
    transport_intercity_vnd: int
    transport_local_vnd:     int
    transport_vnd:           int
    combos_available:        list
    grand_total_vnd:         int
    within_budget:           bool
    savings_or_over_vnd:     int
    combo_override:          bool
    combo_price_vnd:         int
    # SerpAPI data
    serpapi_hotel_name:      str
    serpapi_hotel_price_vnd: int
    serpapi_flight_price_vnd: int
    serpapi_data_available:  bool


class TravelPipelineState(TypedDict):
    messages:               Annotated[list[AnyMessage], add_messages]
    trip:                   TripRequirements
    research:               Annotated[ResearchResults, merge_dict]
    budget:                 BudgetBreakdown
    plan_proposals:         list[str]
    user_selected_plan:     int
    final_plan:             str
    clarification_done:     bool
    clarification_attempts: int
    research_done:          bool
    planning_done:          bool
