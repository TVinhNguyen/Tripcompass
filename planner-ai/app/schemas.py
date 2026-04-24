"""
schemas.py — Pydantic request/response models for all API endpoints.
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ── POST /chat ────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: Optional[str] = None   # auto-generate if None
    message: str


# ── POST /chat/stream (SSE) ───────────────────────────────────────────────────

class StreamChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str


class StreamEvent(BaseModel):
    """One SSE event payload. Serialized as JSON in 'data:' field."""
    type: Literal["tool_start", "token", "done", "error"]
    # tool_start
    tool:    Optional[str] = None
    label:   Optional[str] = None
    # token
    content: Optional[str] = None
    # done
    session_id: Optional[str] = None
    tool_calls: Optional[list[str]] = None
    plan:       Optional[dict] = None
    full_text:  Optional[str] = None
    # error
    message: Optional[str] = None


class ChatResponse(BaseModel):
    session_id:  str
    response:    str
    plan:        Optional[dict] = None  # populated when create_travel_plan is called
    tool_calls:  list[str] = []
    duration_ms: int = 0


# ── POST /plan ────────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    destination: str
    num_days:    int = 3
    start_date:  Optional[str] = None
    end_date:    Optional[str] = None
    budget_vnd:  Optional[int] = Field(default=0)
    guest_count: int = 2
    raw_input:   Optional[str] = None   # free-text override for intent node

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


# ── Session management ────────────────────────────────────────────────────────

class SessionInfo(BaseModel):
    session_id:    str
    created_at:    Optional[str] = None
    last_active:   Optional[str] = None
    message_count: int = 0
    destination:   Optional[str] = None


class SessionHistoryResponse(BaseModel):
    session_id:    str
    messages:      list[dict]
    message_count: int
    meta:          Optional[dict] = None

