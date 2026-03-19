"""
Judge agent — reviews the itinerary and produces final formatted output with budget table.
"""

import json
from langchain_core.messages import AIMessage, SystemMessage, HumanMessage

from app.config.settings import extractor_llm, console, TODAY
from app.models.state import TravelPipelineState
from app.models.extraction_models import JudgeOutput

judge_llm = extractor_llm.with_structured_output(JudgeOutput)


def judge_agent(state: TravelPipelineState) -> dict:
    console.print("\n[bold green]━━━ JUDGE AGENT ━━━[/bold green]")
    proposals = state.get("plan_proposals", [])
    if not proposals:
        return {"final_plan": "Lỗi pipeline.", "messages": [AIMessage(content="Lỗi pipeline.")]}

    trip    = state["trip"]
    budget  = state["budget"]
    plan    = proposals[0]    # chỉ 1 plan

    # Judge đánh giá và đưa ra gợi ý cải thiện
    try:
        result = judge_llm.invoke([
            SystemMessage(content=(
                f"Today is {TODAY}. You are reviewing a travel itinerary.\n"
                f"Trip: {json.dumps(trip, ensure_ascii=False)}\n"
                f"Budget (Python-calculated): {json.dumps(budget, ensure_ascii=False)}\n"
                "Review the plan and provide:\n"
                "- winner_index: always 0 (only 1 plan)\n"
                "- winner_reasoning: 2 sentences in Vietnamese explaining why this is a good plan\n"
                "- improvement_note: 1 specific actionable tip to improve the itinerary\n"
                "Return JSON matching JudgeOutput schema."
            )),
            HumanMessage(content=plan[:4000]),
        ])
        reasoning   = result.winner_reasoning
        improvement = result.improvement_note
    except Exception:
        reasoning   = "Lịch trình được lên kế hoạch phù hợp với ngân sách và phong cách du lịch."
        improvement = "Nên đặt vé máy bay và khách sạn sớm để có giá tốt hơn."

    console.print(f"[green]  ✓ Judge reviewed[/green]")

    b = budget

    # SerpAPI verified badge
    serpapi_badge = ""
    if b.get("serpapi_data_available"):
        parts = []
        if b.get("serpapi_hotel_name"):
            parts.append(f"🏨 {b['serpapi_hotel_name']}: {b.get('serpapi_hotel_price_vnd',0):,} VND/đêm")
        if b.get("serpapi_flight_price_vnd", 0) > 0:
            parts.append(f"✈️ Vé máy bay KH: {b.get('serpapi_flight_price_vnd',0):,} VND")
        if parts:
            serpapi_badge = "\n> ⭐ **Giá xác minh qua SerpAPI/Google:** " + " | ".join(parts) + "\n"

    combo_row = ""
    if b.get("combo_override"):
        item_sum  = (b.get("total_hotel_vnd",0) + b.get("attractions_total_vnd",0)
                     + b.get("total_food_vnd",0) + b.get("transport_vnd",0))
        combo_row = (
            f"\n| 🎫 Combo deal | **{b.get('combo_price_vnd',0):,} VND** |"
            f"\n| ~~Itemized~~ | ~~{item_sum:,} VND~~ |"
        )

    origin      = trip.get("origin", "")
    destination = trip.get("destination", "")

    final_output = f"""# 🏖️ Kế hoạch du lịch {destination} — {trip.get('departure_date','')}

**{trip.get('num_people',2)} người** | {trip.get('departure_date','')} → {trip.get('return_date','')} | {trip.get('num_nights','?')} đêm
{serpapi_badge}
{reasoning}

---

{plan}

---

## 💰 Tóm tắt ngân sách *(Python-calculated)*

| Hạng mục | Chi phí |
|----------|---------|
| 🏨 Khách sạn ({b.get('hotel_per_night_vnd',0):,} VND/đêm × {trip.get('num_nights','?')} đêm) | {b.get('total_hotel_vnd',0):,} VND |
| 🎡 Tham quan | {b.get('attractions_total_vnd',0):,} VND |
| 🍜 Ăn uống ({b.get('food_per_day_vnd',0):,} VND/người/ngày) | {b.get('total_food_vnd',0):,} VND |
| ✈️ Vé đi lại {origin} ↔ {destination} | {b.get('transport_intercity_vnd',0):,} VND |
| 🚗 Di chuyển nội địa tại {destination} | {b.get('transport_local_vnd',0):,} VND |{combo_row}
| **Tổng cộng** | **{b.get('grand_total_vnd',0):,} VND** |
| Ngân sách | {trip.get('budget_vnd',0):,} VND |
| {'✅ Tiết kiệm được' if b.get('within_budget') else '⚠️ Vượt ngân sách'} | {abs(b.get('savings_or_over_vnd',0)):,} VND |

> 💡 **Gợi ý:** {improvement}
"""
    return {"final_plan": final_output, "messages": [AIMessage(content=final_output)]}
