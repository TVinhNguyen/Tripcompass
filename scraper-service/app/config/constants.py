"""
Constants for scraper-service.
"""

# Price limits
MAX_ATTRACTION_VND = 1_000_000
MAX_MEAL_VND = 1_000_000

# Destination list
DESTINATION_LIST = [
    "Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Nha Trang", "Phú Quốc",
    "Huế", "Đà Lạt", "Hội An", "Hải Phòng", "Cần Thơ",
    "Buôn Ma Thuột", "Quy Nhơn", "Vinh",
]

# Apify Google Maps Actor ID (cố định)
APIFY_ACTOR_ID = "nwua9Gu5YrADL7ZDj"

# Scraper limits
APIFY_MAX_PLACES_PER_SEARCH = int(30)
APIFY_MAX_IMAGES = 5
APIFY_MAX_REVIEWS = 5

SERPAPI_MAX_CALLS = 30
SERPAPI_MAX_IMAGES = 5

MAX_GAP_FILLS = 10
MAX_CHUNK_SIZE = 50
