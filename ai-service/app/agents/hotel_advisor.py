"""
Hotel Advisor — standalone agent (không nằm trong pipeline chính).
User gọi riêng khi muốn hỏi về khách sạn và combo lưu trú.

Usage:
    from app.agents.hotel_advisor import run_hotel_advisor
    result = run_hotel_advisor(
        destination="Nha Trang",
        check_in="2026-04-10", check_out="2026-04-13",
        num_people=2, hotel_budget_per_night=500_000
    )
"""

from langchain_core.messages import SystemMessage, HumanMessage

from app.config.settings import llm, console, get_today
from app.utils.llm_factory import _to_text


HOTEL_ADVISOR_PROMPT = """Today is {today}. Bạn là chuyên gia tư vấn khách sạn.

User cần tìm khách sạn tại {destination}.
Check-in: {check_in} | Check-out: {check_out} | {num_people} người
Ngân sách: {hotel_budget_per_night:,} VND/đêm

Tìm kiếm và so sánh:

1. Khách sạn thường (Agoda/Booking.com):
   - Giá thực tế, đánh giá, vị trí
   - Gần biển / trung tâm / sân bay

2. Resort combo có thể offer better value:
   VD: Vinpearl Melia = khách sạn + VinWonders access + priority boarding + breakfast
   → So sánh với: khách sạn thường + mua vé VinWonders riêng

Phân tích value proposition cho mỗi option:
- Giá combo vs giá lẻ từng thứ
- Benefits đặc biệt (breakfast, access, transfer, early check-in...)
- Phù hợp với travel style và thời gian không?

Đặc biệt chú ý:
- Nếu combo bao gồm attraction access → tính savings so với mua lẻ
- Nếu combo có breakfast → tiết kiệm ~150k/người/ngày
- Nếu combo có priority access → tiết kiệm thời gian排队

Output format:
## So sánh khách sạn tại {destination}

### 🏨 Khách sạn thường
- Option A: ...
- Option B: ...

### 🏝️ Resort/Combo
- Combo A: [tên] — [giá] — [included items] — [so sánh vs mua lẻ]
- Combo B: ...

### 💡 Đề xuất
[Lựa chọn tốt nhất + lý do + cách đặt]
"""


def run_hotel_advisor(
    destination: str,
    check_in: str,
    check_out: str,
    num_people: int = 2,
    hotel_budget_per_night: int = 0,
) -> str:
    """
    Standalone hotel advisor. Không nằm trong pipeline chính.
    Trả về text so sánh các option khách sạn/combo.
    """
    console.print("\n[bold blue]━━━ HOTEL ADVISOR ━━━[/bold blue]")

    prompt = HOTEL_ADVISOR_PROMPT.format(
        today=get_today(),
        destination=destination,
        check_in=check_in,
        check_out=check_out,
        num_people=num_people,
        hotel_budget_per_night=hotel_budget_per_night or 500_000,
    )

    try:
        response = llm.invoke([
            SystemMessage(content=prompt),
            HumanMessage(content="Tìm và so sánh các option khách sạn. Dùng web_search để lấy giá thực tế."),
        ])
        result = _to_text(response.content).strip()
        console.print(f"  [green]✓ Hotel advice generated ({len(result)} chars)[/green]")
        return result
    except Exception as e:
        console.print(f"[red]  ✗ Error: {e}[/red]")
        return f"Lỗi khi tìm khách sạn: {e}"
