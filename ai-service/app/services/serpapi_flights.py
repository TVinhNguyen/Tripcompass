"""
SerpAPI Google Flights integration — real-time flight price search.
"""

import time

from app.config.settings import SERPAPI_KEY, console
from app.config.constants import to_iata
from app.models.serpapi_models import SerpAPIFlightResult
from app.utils.price_utils import _usd_to_vnd


def search_flights_serpapi(
    origin:      str,   # city name hoặc IATA
    destination: str,   # city name hoặc IATA
    outbound:    str,   # YYYY-MM-DD
    return_date: str,   # YYYY-MM-DD (khứ hồi)
    adults:      int = 2,
) -> tuple[list[SerpAPIFlightResult], list[SerpAPIFlightResult]]:
    """
    Gọi SerpAPI Google Flights engine cho cả 2 chiều.
    Returns: (outbound_flights, return_flights)
    """
    if not SERPAPI_KEY:
        console.print("[yellow]  SerpAPI Flights: no API key — skip[/yellow]")
        return [], []

    origin_iata = to_iata(origin)
    dest_iata   = to_iata(destination)

    def _fetch(dep_airport: str, arr_airport: str, dep_date: str) -> list[SerpAPIFlightResult]:
        try:
            from serpapi import GoogleSearch
            params = {
                "engine":          "google_flights",
                "departure_id":    dep_airport,
                "arrival_id":      arr_airport,
                "outbound_date":   dep_date,
                "currency":        "USD",
                "hl":              "vi",
                "type":            "2",    # 2 = one-way (ta tính riêng từng chiều)
                "adults":          str(adults),
                "api_key":         SERPAPI_KEY,
            }
            results  = GoogleSearch(params).get_dict()
            flights  = (
                results.get("best_flights", []) or
                results.get("other_flights", []) or
                []
            )
            parsed: list[SerpAPIFlightResult] = []
            for f in flights[:6]:
                # Lấy giá của cả itinerary (tất cả hành khách)
                price_raw = f.get("price", 0) or 0
                price_vnd = _usd_to_vnd(float(price_raw)) if price_raw else 0
                if price_vnd == 0:
                    continue

                legs = f.get("flights", [{}])
                first_leg = legs[0] if legs else {}
                parsed.append(SerpAPIFlightResult(
                    airline        = first_leg.get("airline", ""),
                    price_total    = price_vnd,
                    departure_time = first_leg.get("departure_airport", {}).get("time", ""),
                    arrival_time   = legs[-1].get("arrival_airport", {}).get("time", "") if legs else "",
                    duration       = str(f.get("total_duration", "")),
                    stops          = len(legs) - 1,
                    source         = "SerpAPI/Google Flights",
                ))
            parsed.sort(key=lambda x: x.price_total)
            return parsed
        except Exception as exc:
            console.print(f"[yellow]  SerpAPI Flights error: {exc}[/yellow]")
            return []

    outbound_results = _fetch(origin_iata, dest_iata, outbound)
    # Rate limit protection
    if outbound_results:
        time.sleep(1)
    return_results   = _fetch(dest_iata, origin_iata, return_date)

    console.print(
        f"  SerpAPI Flights: {len(outbound_results)} outbound, "
        f"{len(return_results)} return"
    )
    return outbound_results, return_results


def _format_serpapi_flights(
    outbound: list[SerpAPIFlightResult],
    returns:  list[SerpAPIFlightResult],
    origin: str,
    destination: str,
    adults: int,
) -> str:
    """Format flight results thành text để inject vào research."""
    lines = ["## SerpAPI Real-Time Flight Prices\n"]

    if outbound:
        cheapest_out = outbound[0]
        lines.append(
            f"### Outbound: {origin} → {destination}\n"
            f"- Cheapest: {cheapest_out.price_total:,} VND total for {adults} people\n"
            f"- Airline: {cheapest_out.airline}\n"
            f"- Departs: {cheapest_out.departure_time} | Arrives: {cheapest_out.arrival_time}\n"
            f"- Duration: {cheapest_out.duration} min | Stops: {cheapest_out.stops}\n"
            f"- Source: {cheapest_out.source}\n"
        )
        if len(outbound) > 1:
            lines.append("Other options:")
            for f in outbound[1:3]:
                lines.append(f"  - {f.airline}: {f.price_total:,} VND ({f.stops} stops)")
    else:
        lines.append(f"### Outbound: {origin} → {destination}\n- No SerpAPI data — check Traveloka/Vietjet\n")

    if returns:
        cheapest_ret = returns[0]
        lines.append(
            f"\n### Return: {destination} → {origin}\n"
            f"- Cheapest: {cheapest_ret.price_total:,} VND total for {adults} people\n"
            f"- Airline: {cheapest_ret.airline}\n"
            f"- Departs: {cheapest_ret.departure_time}\n"
            f"- Source: {cheapest_ret.source}\n"
        )
    else:
        lines.append(f"\n### Return: {destination} → {origin}\n- No SerpAPI data — check Traveloka/Vietjet\n")

    if outbound and returns:
        round_trip = outbound[0].price_total + returns[0].price_total
        lines.append(f"\n**Round-trip total (cheapest): {round_trip:,} VND for {adults} people**")

    return "\n".join(lines)
