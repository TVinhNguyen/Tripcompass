"""
Constants: required fields, budget limits, IATA codes.
"""

# Required trip fields for hard gate
REQUIRED_TRIP_FIELDS = [
    "destination", "origin", "departure_date",
    "return_date", "num_people", "budget_vnd",
]

# Budget limits
MIN_BUDGET_VND     = 500_000
MAX_BUDGET_VND     = 500_000_000
MAX_TRIP_DAYS      = 30
MIN_HOTEL_VND      = 100_000
MAX_HOTEL_VND      = 10_000_000
MAX_ATTRACTION_VND = 1_000_000
MAX_MEAL_VND       = 1_000_000

# Currency
VND_PER_USD = 25_000  # tỷ giá ước tính USD → VND

# IATA codes cho các thành phố phổ biến ở Việt Nam
IATA_MAP = {
    "hà nội": "HAN", "ha noi": "HAN", "hanoi": "HAN", "noi bai": "HAN",
    "hồ chí minh": "SGN", "ho chi minh": "SGN", "saigon": "SGN", "sai gon": "SGN",
    "đà nẵng": "DAD", "da nang": "DAD", "danang": "DAD",
    "nha trang": "CXR", "cam ranh": "CXR",
    "phú quốc": "PQC", "phu quoc": "PQC",
    "huế": "HUI", "hue": "HUI",
    "đà lạt": "DLI", "da lat": "DLI", "dalat": "DLI",
    "hải phòng": "HPH", "hai phong": "HPH",
    "cần thơ": "VCA", "can tho": "VCA",
    "buôn ma thuột": "BMV", "buon ma thuot": "BMV",
    "quy nhơn": "UIH", "quy nhon": "UIH",
    "vinh": "VII",
}


def to_iata(city_name: str) -> str:
    """Convert city name to IATA code. Returns city name if not found."""
    key = city_name.lower().strip()
    return IATA_MAP.get(key, city_name.upper()[:3])
