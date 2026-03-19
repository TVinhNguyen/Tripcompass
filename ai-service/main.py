"""
Travel Agent v7 + SerpAPI — Entry point.
"""

import uuid
import json
from datetime import datetime

from rich.markdown import Markdown
from langchain_core.messages import HumanMessage

from app.config.settings import console
from app.models.state import TravelPipelineState
from app.pipeline.graph import travel_app

if __name__ == "__main__":
    session_id = f"trip-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    config     = {"configurable": {"thread_id": session_id}}
    console.print(f"[dim]Session: {session_id}[/dim]")

    full_request = (
        "Tôi muốn đi Nha Trang từ ngày 10/04/2026, về ngày 13/04/2026, "
        "xuất phát từ Hà Nội, 2 người. "
        "Ngân sách khoảng 10 triệu VND tổng. "
        "Thích khám phá và ăn đồ địa phương."
    )

    console.print("[bold]🚀 Travel Agent v7 + SerpAPI[/bold]\n")

    initial_state = TravelPipelineState(
        messages=[HumanMessage(content=full_request)],
        trip={}, research={}, budget={},
        plan_proposals=[], user_selected_plan=0, final_plan="",
        clarification_done=False, clarification_attempts=0,
        research_done=False, planning_done=False,
    )

    final_state = travel_app.invoke(initial_state, config=config)

    if final_state.get("final_plan") and not final_state.get("plan_proposals"):
        console.print(Markdown(final_state["final_plan"]))
        exit(0)

    if not final_state.get("final_plan"):
        console.print("[red]No final plan produced.[/red]")
        exit(1)

    console.print("\n" + "━"*60)
    console.print(Markdown(final_state["final_plan"]))

    with open("travel_plan_final.json", "w", encoding="utf-8") as f:
        json.dump({
            "session_id":  session_id,
            "trip":        final_state["trip"],
            "budget":      final_state["budget"],
            "plan":        final_state["final_plan"],
            "serpapi_used": final_state["budget"].get("serpapi_data_available", False),
        }, f, ensure_ascii=False, indent=2)

    console.print(f"\n[green]✓ Saved → travel_plan_final.json (session: {session_id})[/green]")
