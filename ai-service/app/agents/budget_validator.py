"""
Budget validator agent — Python math-based budget calculation (no LLM math).
"""

import re
from langchain_core.messages import SystemMessage, HumanMessage

from app.config.settings import console, extractor_llm
from app.config.constants import MIN_HOTEL_VND, MAX_HOTEL_VND, MAX_ATTRACTION_VND, MAX_MEAL_VND
from app.models.state import TravelPipelineState, BudgetBreakdown
from app.models.extraction_models import HotelExtract, AttractionExtract, FoodExtract
from app.utils.price_utils import (
    _extract_vnd_amounts, _extract_combo_totals,
    _regex_hotel_price, _regex_attraction_prices, _regex_food_per_day,
)


def budget_validator(state: TravelPipelineState) -> dict:
    console.print("\n[bold yellow]━━━ BUDGET VALIDATOR (Python Math) ━━━[/bold yellow]")

    trip         = state["trip"]
    research     = state["research"]
    budget_limit = trip["budget_vnd"]
    num_people   = trip["num_people"]
    num_nights   = trip.get("num_nights", 3)
    num_days     = trip.get("num_days",   4)

    hotel_text     = research.get("hotels",      "")
    attr_text      = research.get("attractions", "")
    food_text      = research.get("food",        "")
    combo_text     = research.get("combos",      "")
    transport_text = research.get("transport",   "")

    h_llm = extractor_llm.with_structured_output(HotelExtract)
    a_llm = extractor_llm.with_structured_output(AttractionExtract)
    f_llm = extractor_llm.with_structured_output(FoodExtract)

    # ── Hotels: SerpAPI data được prepend ở đầu hotel_text ───────────────
    console.print("  Hotels...", end=" ")
    price_per_night, num_rooms = 0, 1
    serpapi_hotel_name  = ""
    serpapi_hotel_price = 0
    serpapi_data        = False

    # Kiểm tra SerpAPI section trong hotel_text
    if "SerpAPI Real-Time Hotel Prices" in hotel_text:
        serpapi_data = True
        # Tìm giá SerpAPI đầu tiên (rẻ nhất vì đã sort)
        m = re.search(r'Rate:\s*([\d,]+)\s*VND/night', hotel_text)
        if m:
            price_per_night = int(m.group(1).replace(",", ""))
            # Tìm tên hotel tương ứng
            nm = re.search(r'###\s*(.+?)\n.*?Rate:', hotel_text, re.DOTALL)
            if nm:
                serpapi_hotel_name  = nm.group(1).strip()
                serpapi_hotel_price = price_per_night
                console.print(f"[green]SerpAPI: {serpapi_hotel_name}[/green]", end=" ")

    if not (MIN_HOTEL_VND <= price_per_night <= MAX_HOTEL_VND):
        try:
            h               = h_llm.invoke([
                SystemMessage(content="Extract cheapest mid-range hotel nightly rate in VND. Plain integer only."),
                HumanMessage(content=f"HOTEL RESEARCH:\n{hotel_text[:3000]}"),
            ])
            price_per_night = h.price_per_night_vnd
            num_rooms       = max(h.num_rooms, 1)
        except Exception as e:
            console.print(f"[yellow]LLM err: {e}[/yellow]", end=" ")

    if not (MIN_HOTEL_VND <= price_per_night <= MAX_HOTEL_VND):
        console.print("[yellow](regex)[/yellow]", end=" ")
        price_per_night = _regex_hotel_price(hotel_text)

    hotel_total = price_per_night * num_nights * num_rooms
    console.print(f"[green]{hotel_total:,} VND[/green] ({price_per_night:,}/đêm × {num_nights}đêm)")

    # ── Attractions ───────────────────────────────────────────────────────
    console.print("  Attractions...", end=" ")
    attraction_prices = []
    try:
        a                 = a_llm.invoke([
            SystemMessage(content="Extract admission price per person (VND) for each attraction. List of integers. Free = 0."),
            HumanMessage(content=f"ATTRACTIONS:\n{attr_text[:3000]}"),
        ])
        attraction_prices = [p for p in a.admission_prices_vnd if 0 <= p <= MAX_ATTRACTION_VND]
    except Exception as e:
        console.print(f"[yellow]err: {e}[/yellow]", end=" ")
    if not attraction_prices:
        console.print("[yellow](regex)[/yellow]", end=" ")
        attraction_prices = _regex_attraction_prices(attr_text)
    attractions_total = sum(attraction_prices) * num_people
    console.print(f"[green]{attractions_total:,} VND[/green] ({len(attraction_prices)} venues)")

    # ── Food ──────────────────────────────────────────────────────────────
    console.print("  Food...", end=" ")
    food_per_day = 0
    try:
        f        = f_llm.invoke([
            SystemMessage(content="Extract average cost of ONE meal per person (VND). Plain integer, 30000-300000."),
            HumanMessage(content=f"FOOD:\n{food_text[:3000]}"),
        ])
        avg_meal = f.avg_meal_cost_per_person_vnd
        if 20_000 <= avg_meal <= MAX_MEAL_VND:
            food_per_day = avg_meal * 3
    except Exception as e:
        console.print(f"[yellow]err: {e}[/yellow]", end=" ")
    if food_per_day == 0:
        console.print("[yellow](regex)[/yellow]", end=" ")
        food_per_day = _regex_food_per_day(food_text)
    food_total = food_per_day * num_days * num_people
    console.print(f"[green]{food_total:,} VND[/green] ({food_per_day:,}/người/ngày × {num_days}ngày)")

    # ── Transport: SerpAPI data được prepend ở đầu transport_text ────────
    console.print("  Transport intercity...", end=" ")
    transport_intercity = 0
    serpapi_flight_price = 0

    # Kiểm tra SerpAPI flight section
    if "SerpAPI Real-Time Flight Prices" in transport_text:
        serpapi_data = True
        # Tìm round-trip total từ SerpAPI
        m = re.search(r'Round-trip total.*?:\s*([\d,]+)\s*VND', transport_text)
        if m:
            transport_intercity  = int(m.group(1).replace(",", ""))
            serpapi_flight_price = transport_intercity
            console.print(f"[green]SerpAPI: {transport_intercity:,} VND[/green]", end=" ")

    if transport_intercity == 0:
        # Fallback: regex trên Tavily text
        for pat in [
            r'(?:round.trip|khu hoi|tong|total)\D{0,30}?([\d,]+)\s*VND',
            r'([\d,]+)\s*VND\D{0,30}?(?:round.trip|khu hoi)',
        ]:
            m = re.search(pat, transport_text, re.IGNORECASE)
            if m:
                v = int(m.group(1).replace(",", ""))
                if 500_000 <= v <= 20_000_000:
                    transport_intercity = v
                    break
        if transport_intercity == 0:
            amounts = [a for a in _extract_vnd_amounts(transport_text) if 500_000 <= a <= 20_000_000]
            if amounts:
                transport_intercity = min(amounts)
    console.print(f"[green]{transport_intercity:,} VND[/green]")

    # Local transport
    console.print("  Transport local...", end=" ")
    transport_local = 0
    for pat in [
        r'(?:daily|hang ngay|moi ngay)\D{0,30}?([\d,]+)\s*VND',
        r'(?:airport|san bay|grab|taxi)\D{0,30}?to\D{0,20}?([\d,]+)\s*VND',
    ]:
        m = re.search(pat, transport_text, re.IGNORECASE)
        if m:
            v = int(m.group(1).replace(",", ""))
            if 30_000 <= v <= 2_000_000:
                transport_local = v
                break
    if transport_local == 0:
        amounts = [a for a in _extract_vnd_amounts(transport_text) if 30_000 <= a <= 500_000]
        if amounts:
            transport_local = min(amounts)
    transport_local_total = transport_local * num_days
    console.print(f"[green]{transport_local_total:,} VND[/green] ({transport_local:,}/ngày × {num_days}ngày)")

    transport = transport_intercity + transport_local_total
    console.print(f"  Transport total:   {transport:>12,} VND")

    # ── Combo ─────────────────────────────────────────────────────────────
    combo_totals = _extract_combo_totals(combo_text, num_people)
    best_combo   = min((p for p in combo_totals if p <= budget_limit), default=None)
    if best_combo:
        console.print(f"  Combo candidates: {[f'{p:,}' for p in combo_totals[:3]]}")

    # ── Python Math ───────────────────────────────────────────────────────
    itemized_total = hotel_total + attractions_total + food_total + transport
    combo_override = bool(best_combo and best_combo < itemized_total)
    grand_total    = best_combo if combo_override else itemized_total

    if combo_override:
        console.print(f"  [green]Combo ({best_combo:,}) < itemized ({itemized_total:,}) → dùng combo[/green]")

    # Sanity
    min_expected = 200_000 * num_people * num_days
    if grand_total == 0:
        console.print("[bold red]  SANITY FAIL: grand_total = 0[/bold red]")
    elif grand_total < min_expected:
        console.print(f"[yellow]  WARNING: {grand_total:,} < min {min_expected:,}[/yellow]")

    within_budget   = grand_total <= budget_limit
    savings_or_over = budget_limit - grand_total

    console.print(f"  {'─'*42}")
    if serpapi_data:
        console.print(f"  [cyan]⭐ SerpAPI verified prices used[/cyan]")
    console.print(f"  Grand total:  {grand_total:>12,} VND")
    console.print(f"  Budget:       {budget_limit:>12,} VND")
    console.print(f"  {'✓ WITHIN' if within_budget else '✗ OVER'} ({abs(savings_or_over):,} VND)")

    return {"budget": BudgetBreakdown(
        hotel_per_night_vnd      = price_per_night,
        total_hotel_vnd          = hotel_total,
        attractions_total_vnd    = attractions_total,
        food_per_day_vnd         = food_per_day,
        total_food_vnd           = food_total,
        transport_intercity_vnd  = transport_intercity,
        transport_local_vnd      = transport_local_total,
        transport_vnd            = transport,
        combos_available         = combo_totals,
        grand_total_vnd          = grand_total,
        within_budget            = within_budget,
        savings_or_over_vnd      = savings_or_over,
        combo_override           = combo_override,
        combo_price_vnd          = best_combo or 0,
        serpapi_hotel_name       = serpapi_hotel_name,
        serpapi_hotel_price_vnd  = serpapi_hotel_price,
        serpapi_flight_price_vnd = serpapi_flight_price,
        serpapi_data_available   = serpapi_data,
    )}
