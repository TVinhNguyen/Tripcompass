"""
routes/sessions.py — Session management API.
"""
from fastapi import APIRouter, HTTPException

from app.schemas import SessionInfo, SessionHistoryResponse
from app.services.chat_history import load_history
from app.services.session_manager import get_session_meta, list_sessions, delete_session

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionInfo])
async def get_sessions():
    """List all active sessions with metadata."""
    return [SessionInfo(**s) for s in await list_sessions()]


@router.get("/{session_id}/history", response_model=SessionHistoryResponse)
async def get_session_history(session_id: str):
    """View full chat history for a session."""
    history = await load_history(session_id)
    if not history:
        raise HTTPException(404, f"Session '{session_id}' not found or expired")
    meta = await get_session_meta(session_id)
    return SessionHistoryResponse(
        session_id=session_id,
        messages=history,
        message_count=len(history),
        meta=meta,
    )


@router.delete("/{session_id}")
async def remove_session(session_id: str):
    """Delete a specific session (history + metadata)."""
    if not await delete_session(session_id):
        raise HTTPException(404, f"Session '{session_id}' not found")
    return {"deleted": True, "session_id": session_id}
