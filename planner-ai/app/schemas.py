"""
schemas.py — Pydantic request/response models for all API endpoints.
"""
from typing import Optional, Literal
from pydantic import AliasChoices, BaseModel, Field, field_validator


# ── POST /chat ────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: Optional[str] = None   # auto-generate if None
    message: str
    itinerary_context: Optional[dict] = None


# ── POST /chat/stream (SSE) ───────────────────────────────────────────────────

class StreamChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    itinerary_context: Optional[dict] = None


class StreamEvent(BaseModel):
    """One SSE event payload. Serialized as JSON in 'data:' field.

    `thinking` is a heartbeat the pump emits during silent gaps so the FE
    can keep an indicator alive. It was missing from the previous Literal
    even though pump.py actually emits it — that was a real schema drift
    flagged in the C4 audit.
    """
    type: Literal["thinking", "tool_start", "token", "done", "error"]
    # tool_start
    tool:    Optional[str] = None
    label:   Optional[str] = None
    # token
    content: Optional[str] = None
    # done — populated only on the final event of a turn
    session_id: Optional[str] = None
    tool_calls: Optional[list[str]] = None
    plan:       Optional[dict] = None
    full_text:  Optional[str] = None
    stream_dropped: Optional[bool] = None
    # error
    message: Optional[str] = None



# ── POST /plan ────────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    destination: str
    num_days:    int = 3
    start_date:  Optional[str] = None
    end_date:    Optional[str] = None
    budget_vnd:  Optional[int] = Field(default=0)
    guest_count: int = 2
    travel_style: Optional[Literal["relaxed", "balanced", "standard", "active"]] = None
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None
    daily_start_time: Optional[str] = None
    daily_end_time: Optional[str] = None
    time_strictness: Optional[Literal["flexible", "balanced", "strict"]] = "balanced"
    preferences: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("preferences", "preference_tags"),
    )
    required_places: list[str] = Field(default_factory=list)
    need_hotel:  bool = True
    need_flight: bool = False
    raw_input:   Optional[str] = None   # free-text override for intent node

    @field_validator("preferences")
    @classmethod
    def normalize_preferences(cls, value: list[str]) -> list[str]:
        return sorted({
            str(pref).strip().lower()
            for pref in (value or [])
            if str(pref).strip()
        })

    @field_validator("required_places")
    @classmethod
    def normalize_required_places(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for place in value or []:
            normalized = " ".join(str(place).strip().split())
            key = normalized.lower()
            if not normalized or key in seen:
                continue
            seen.add(key)
            out.append(normalized)
        return out

    class Config:
        populate_by_name = True


class PlanResponse(BaseModel):
    session_id:        str
    destination:       str
    budget_tier:       str
    final_plan:        dict
    warnings:          list[str]
    budget_breakdown:  dict = {}
    validation_passed: bool
    violations:        list[dict]
    duration_ms:       int
    cache_hit:         bool
