"""
SerpAPI response models for hotels and flights.
"""

from pydantic import BaseModel


class SerpAPIHotelResult(BaseModel):
    """Parsed result từ Google Hotels API."""
    hotel_name:      str = ""
    price_per_night: int = 0   # VND
    total_price:     int = 0   # VND cho toàn bộ stay
    rating:          float = 0.0
    address:         str = ""
    source:          str = "SerpAPI/Google Hotels"


class SerpAPIFlightResult(BaseModel):
    """Parsed result từ Google Flights API."""
    airline:         str = ""
    price_total:     int = 0   # VND cho cả nhóm, 1 chiều
    departure_time:  str = ""
    arrival_time:    str = ""
    duration:        str = ""
    stops:           int = 0
    source:          str = "SerpAPI/Google Flights"
