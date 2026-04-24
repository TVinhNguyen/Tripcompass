"""
Node 4: Budget Classify — Code only, no LLM.
Migrated from Go dynamicBudgetRatio() + ClassifyBudget() in budget.go / strategy.go.

LLM hallucinate numbers — this node is deterministic Python math.
"""
from app.state import TravelPlanState

# ── Destination-specific meal costs (VND per person per meal) ────────────────
DEST_MEAL_COST: dict[str, int] = {
    "đà nẵng":      85_000,
    "hội an":       100_000,
    "hà nội":       65_000,
    "hồ chí minh":  100_000,
    "nha trang":    80_000,
    "đà lạt":       70_000,
    "phú quốc":     120_000,
    "huế":          70_000,
    "sapa":         75_000,
    "hạ long":      90_000,
    "ninh bình":    70_000,
}

DEFAULT_MEAL_COST = 80_000  # fallback if destination not in table

# ── Minimum viable daily cost per person per destination ────────────────────
MIN_DAILY_COST: dict[str, int] = {
    "đà nẵng":      250_000,
    "hội an":       300_000,
    "hà nội":       200_000,
    "hồ chí minh":  220_000,
    "nha trang":    280_000,
    "đà lạt":       220_000,
    "phú quốc":     400_000,
    "huế":          200_000,
    "hạ long":      300_000,
}

DEFAULT_MIN_DAILY = 250_000

# ── Default hotel budget per tier (VND per night per room) ─────────────────
TIER_HOTEL_DEFAULTS: dict[str, int] = {
    "survival": 150_000,
    "budget":   400_000,
    "standard": 800_000,
    "premium":  2_500_000,
}

# ── Full budget constraints per tier ────────────────────────────────────────
BUDGET_CONSTRAINTS: dict[str, dict] = {
    "survival": {
        "hotel_per_night":      150_000,
        "food_per_meal":         30_000,
        "attraction_per_day":    50_000,
        "only_free_attractions": True,
        "food_mode":             "street",
        "allow_day_trips":       False,
        "allow_full_day_premium":False,
        "warn_message": (
            "⚠️ Budget rất thấp. Lịch trình sẽ ưu tiên các điểm miễn phí "
            "và ăn vỉa hè. Một số địa điểm phổ biến có thể không nằm trong lịch."
        ),
    },
    "budget": {
        "hotel_per_night":      400_000,
        "food_per_meal":         70_000,
        "attraction_per_day":   200_000,
        "only_free_attractions": False,
        "food_mode":             "local",
        "allow_day_trips":       False,
        "allow_full_day_premium":False,
        "warn_message": None,
    },
    "standard": {
        "hotel_per_night":      800_000,
        "food_per_meal":        150_000,
        "attraction_per_day":   500_000,
        "only_free_attractions": False,
        "food_mode":             "restaurant",
        "allow_day_trips":       True,
        "allow_full_day_premium":True,
        "warn_message": None,
    },
    "premium": {
        "hotel_per_night":    2_500_000,
        "food_per_meal":        400_000,
        "attraction_per_day": 2_000_000,
        "only_free_attractions": False,
        "food_mode":             "fine",
        "allow_day_trips":       True,
        "allow_full_day_premium":True,
        "warn_message": None,
    },
}


def node_budget(state: TravelPlanState) -> dict:
    """
    Node 4: Classifies budget tier and computes spending splits.
    Pure Python — no async, no LLM.
    """
    budget    = state.get("budget_vnd", 0)
    days      = state.get("num_days", 3)
    people    = state.get("guest_count", 2)
    dest      = state.get("destination_id", "")

    # ── 1. Classify tier ────────────────────────────────────────────────────
    min_daily = MIN_DAILY_COST.get(dest, DEFAULT_MIN_DAILY)

    if budget == 0:
        # User did not mention budget → assume standard
        tier = "standard"
        daily_per_person = 800_000
    else:
        daily_per_person = budget / (days * people)
        if daily_per_person < min_daily * 0.5:
            tier = "survival"
        elif daily_per_person < 700_000:
            tier = "budget"
        elif daily_per_person < 2_000_000:
            tier = "standard"
        else:
            tier = "premium"

    # ── 2. Dynamic attr/food split ──────────────────────────────────────────
    meal_cost  = DEST_MEAL_COST.get(dest, DEFAULT_MEAL_COST)
    est_food   = meal_cost * people * 3 * days  # 3 meals/day
    food_pct   = est_food / budget if budget > 0 else 0.40

    if food_pct > 0.50:
        attr_ratio, food_ratio = 0.25, 0.60   # food-heavy trip
    elif food_pct < 0.15:
        attr_ratio, food_ratio = 0.55, 0.25   # luxury trip, attr-heavy
    else:
        attr_ratio, food_ratio = 0.45, 0.40   # standard split

    effective_budget = budget if budget > 0 else daily_per_person * days * people

    # ── 3. Hotel budget from retrieved hotels (real prices) ─────────────────
    retrieved = state.get("retrieved_data", {})
    hotels    = retrieved.get("hotels", [])
    if hotels:
        # Use cheapest hotel that fits the tier
        prices = [h.get("price_per_night_vnd", 0) for h in hotels if h.get("price_per_night_vnd")]
        hotel_budget = min(prices) if prices else TIER_HOTEL_DEFAULTS[tier]
    else:
        hotel_budget = TIER_HOTEL_DEFAULTS[tier]

    constraints = BUDGET_CONSTRAINTS[tier]
    warnings    = list(state.get("warnings", []))
    if constraints.get("warn_message"):
        warnings.append(constraints["warn_message"])

    return {
        "budget_tier":              tier,
        "attr_budget":              int(effective_budget * attr_ratio),
        "food_budget":              int(effective_budget * food_ratio),
        "hotel_budget_per_night":   hotel_budget,
        "budget_constraints":       constraints,
        "budget_per_day_per_person": int(daily_per_person),
        "warnings":                 warnings,
    }
