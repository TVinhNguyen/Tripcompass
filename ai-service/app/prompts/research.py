"""
Prompt templates for all 5 parallel research agents.
"""

ATTRACTIONS_PROMPT = """Today is {today}. Research ATTRACTIONS for {destination}.
{departure_date}->{return_date} | {num_people} people | {budget_vnd:,} VND | Style: {travel_style}

web_search 3-4 times. STRICT RULES:
- Use ONLY official 2025/2026 prices from the attraction's official site or Klook/Traveloka.
- NEVER estimate prices. Theme parks (VinWonders, Vinpearl) change prices yearly.
- Include FULL address (street + district) for each venue.

Find:
1. Top 5-8 attractions — official admission price (VND/person) + full address
2. Opening hours
3. Hidden gems matching "{travel_style}"

## Attractions Research
### [Exact Venue Name]
- Address: [full street address, district]
- Admission: X,000 VND / person (source: official/Klook/...)
- Hours: ...
- Notes: ...
"""

FOOD_PROMPT = """Today is {today}. Research FOOD & RESTAURANTS for {destination}.
{departure_date}->{return_date} | {num_people} people | {budget_vnd:,} VND

web_search 3-4 times. STRICT RULES:
- Report SPECIFIC restaurant/stall names — NOT generic dish names alone.
- Include FULL address (street + district).
- Prices from actual menu or 2024-2026 reviews only.
- For street food: include market/street name.

Find for each must-try dish, name TOP 2 specific restaurants:
  e.g. "Banh canh cha ca: Quan Ba Thua - 16 Phan Boi Chau, Nha Trang (70-90k/bowl)"

## Food Research
### [Specific Restaurant/Stall Name]
- Address: [full address]
- Specialty: [dish name]
- Price: X,000-Y,000 VND / person
- Notes: [hours, tips]
"""

HOTELS_PROMPT = """Today is {today}. Research HOTELS for {destination}.
Check-in: {departure_date} | Check-out: {return_date} | {num_people} people | {budget_vnd:,} VND

web_search 3-4 times — REAL prices from Agoda/Booking.com.
Search near beach and city center separately.

## Hotel Research
### [Hotel Name]
- Rate: X,000 VND/night (source: Agoda/Booking)
- Total: Y,000 VND for stay
- Address: [street address]
- Distance to beach/center: ...
"""

COMBOS_PROMPT = """Today is {today}. Research TOUR PACKAGES for {destination}.
{departure_date}->{return_date} | {num_people} people | {budget_vnd:,} VND

web_search 2-3 times. Only TOTAL group prices (NOT per person).

## Combos Research
### [Package Name]
- Total price: X,000,000 VND for {num_people} people
- Includes: ...
"""

TRANSPORT_PROMPT = """Today is {today}. Research TRANSPORT from {origin} to {destination}.
Dates: {departure_date} (out) / {return_date} (return) | {num_people} people

web_search 3-4 times. Find ACTUAL prices.
1. Flights: search "ve may bay {origin} {destination} {departure_date}" on Traveloka/Vietjet/VNA
2. Train if route exists and is cheaper
3. Airport/station → city center at {destination}: Grab vs taxi price (one way)

ALL prices = TOTAL for {num_people} people.

## Transport Research
### Intercity
- Cheapest option: X,000,000 VND round-trip for {num_people} people
- Provider: ...

### Local at {destination}
- Airport/station → center: X,000 VND (Grab)
- Daily local transport: Y,000 VND/day
"""
