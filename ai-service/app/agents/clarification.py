"""
Clarification agent — collects required trip info from the user.
"""

from langchain_core.messages import AIMessage

from app.config.settings import console, extractor_llm
from app.config.constants import REQUIRED_TRIP_FIELDS, MIN_BUDGET_VND
from app.models.state import TravelPipelineState, TripRequirements
from app.models.extraction_models import ClarificationResult
from app.prompts.clarification import CLARIFICATION_SYSTEM
from app.utils.date_utils import _parse_and_validate_dates, DateSpanError, _recover_dates_from_messages
from langchain_core.messages import SystemMessage

clarification_llm = extractor_llm.with_structured_output(ClarificationResult)


def clarification_agent(state: TravelPipelineState) -> dict:
    console.print("\n[bold cyan]━━━ CLARIFICATION AGENT ━━━[/bold cyan]")
    result      = clarification_llm.invoke(
        [SystemMessage(content=CLARIFICATION_SYSTEM)] + state["messages"]
    )
    trip_payload = dict(result.trip or {})

    # Fallback nếu LLM miss ngày
    for k, v in _recover_dates_from_messages(state["messages"]).items():
        if v and not trip_payload.get(k):
            trip_payload[k] = v

    missing_after = [f for f in REQUIRED_TRIP_FIELDS if not trip_payload.get(f)]

    if not result.is_complete and missing_after:
        console.print(f"[yellow]  Missing: {missing_after}[/yellow]")
        return {
            "messages": [AIMessage(content=result.follow_up_question)],
            "clarification_done":    False,
            "clarification_attempts": state.get("clarification_attempts", 0) + 1,
        }

    trip = TripRequirements(**{
        k: v for k, v in trip_payload.items()
        if k in TripRequirements.__annotations__ and v is not None and v != ""
    })
    if not trip.get("travel_style"):
        trip["travel_style"] = "exploration"

    # Hard gate
    missing_hard = [f for f in REQUIRED_TRIP_FIELDS if not trip.get(f)]
    if missing_hard:
        msg = (
            "Để lên kế hoạch chính xác, mình cần thêm:\n"
            + "\n".join(f"  • {f}" for f in missing_hard)
        )
        console.print(f"[red]  Hard gate: {missing_hard}[/red]")
        return {
            "messages": [AIMessage(content=msg)],
            "clarification_done":    False,
            "clarification_attempts": state.get("clarification_attempts", 0) + 1,
        }

    # Budget sanity
    if trip.get("budget_vnd", 0) < MIN_BUDGET_VND:
        return {
            "messages": [AIMessage(content=f"Ngân sách {trip.get('budget_vnd',0):,} VND quá thấp. Xác nhận lại?")],
            "clarification_done":    False,
            "clarification_attempts": state.get("clarification_attempts", 0) + 1,
        }

    # Date span
    try:
        num_nights, num_days = _parse_and_validate_dates(trip["departure_date"], trip["return_date"])
    except DateSpanError as exc:
        return {
            "messages": [AIMessage(content=str(exc))],
            "clarification_done":    False,
            "clarification_attempts": state.get("clarification_attempts", 0) + 1,
        }

    updated_trip = dict(trip)
    updated_trip["num_nights"] = num_nights
    updated_trip["num_days"]   = num_days

    console.print(
        f"[green]  ✓ {updated_trip['destination']} | "
        f"{updated_trip['departure_date']}→{updated_trip['return_date']} "
        f"({num_nights}đêm) | {updated_trip['num_people']} người | "
        f"{updated_trip.get('budget_vnd',0):,} VND[/green]"
    )
    return {"trip": updated_trip, "clarification_done": True}


def should_clarify_or_proceed(state: TravelPipelineState) -> str:
    if state.get("clarification_done"):
        return "destination_analyst"
    if state.get("clarification_attempts", 0) >= 3:
        return "abort"
    return "clarification"


def abort_node(state: TravelPipelineState) -> dict:
    msg = (
        "Mình đã hỏi 3 lần nhưng vẫn thiếu thông tin. "
        "Vui lòng cung cấp: điểm đến, nơi xuất phát, ngày đi, ngày về, số người, ngân sách."
    )
    return {"final_plan": msg, "messages": [AIMessage(content=msg)]}
