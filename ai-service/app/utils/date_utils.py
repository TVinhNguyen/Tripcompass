"""
Date parsing and validation utilities.
"""

import re
from datetime import datetime, date
from langchain_core.messages import HumanMessage

from app.config.constants import MAX_TRIP_DAYS


class DateSpanError(ValueError):
    pass


def _parse_and_validate_dates(departure_date: str, return_date: str) -> tuple[int, int]:
    try:
        dep = datetime.strptime(departure_date, "%Y-%m-%d").date()
        ret = datetime.strptime(return_date,    "%Y-%m-%d").date()
    except ValueError as exc:
        raise DateSpanError(f"Ngày không đúng định dạng YYYY-MM-DD: {exc}") from exc

    today = date.today()
    if dep < today:
        raise DateSpanError(
            f"Ngày khởi hành {departure_date} đã trong quá khứ. Vui lòng nhập ngày từ hôm nay trở đi."
        )
    num_nights = (ret - dep).days
    if num_nights <= 0:
        raise DateSpanError(
            f"Ngày về ({return_date}) phải sau ngày đi ({departure_date}) ít nhất 1 ngày."
        )
    if num_nights > MAX_TRIP_DAYS:
        raise DateSpanError(
            f"Chuyến đi {num_nights} đêm vượt quá giới hạn {MAX_TRIP_DAYS} ngày."
        )
    return num_nights, num_nights + 1


def _to_iso_date(raw: str) -> str:
    raw = (raw or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def _recover_dates_from_messages(messages: list) -> dict:
    user_text = "\n".join(
        m.content for m in messages
        if isinstance(m, HumanMessage) and isinstance(m.content, str)
    )
    tokens = re.findall(r"\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b", user_text)
    iso    = [_to_iso_date(t) for t in tokens if _to_iso_date(t)]
    if len(iso) >= 2:
        return {"departure_date": iso[0], "return_date": iso[1]}
    return {}
