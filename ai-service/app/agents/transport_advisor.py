"""
Transport Advisor — standalone agent (không nằm trong pipeline chính).
User gọi riêng khi muốn hỏi về phương tiện di chuyển đến điểm đến.

Usage:
    from app.agents.transport_advisor import run_transport_advisor
    result = run_transport_advisor(
        origin="Hà Nội", destination="Nha Trang",
        departure_date="2026-04-10", return_date="2026-04-13",
        num_people=2, transport_budget=3_000_000
    )
"""

from langchain_core.messages import SystemMessage, HumanMessage

from app.config.settings import llm, console, get_today
from app.utils.llm_factory import _to_text


TRANSPORT_ADVISOR_PROMPT = """Today is {today}. Bạn là chuyên gia tư vấn phương tiện di chuyển.

User muốn đi từ {origin} đến {destination}.
Ngày đi: {departure_date} | Ngày về: {return_date}
Số người: {num_people} | Ngân sách cho đi lại: {transport_budget:,} VND

Tìm kiếm và so sánh các phương án:
1. Máy bay (search Traveloka/Vietjet/VNA cho vé rẻ nhất)
2. Xe khách giường nằm (Phương Trang, Hoàng Long, Thanh Bình)
3. Tàu hỏa (Vietnam Railways nếu có tuyến)

Với mỗi option, nêu:
- Giá thực tế hiện tại (tổng cả nhóm, khứ hồi)
- Giờ xuất phát / đến nơi
- Thời gian di chuyển
- Lưu ý đặc biệt (xe đêm → ngủ trên xe, tiết kiệm 1 đêm khách sạn)

Đề xuất strategy tối ưu:
- Same mode cả 2 chiều, hoặc
- Mixed: đi mode A về mode B và lý do

Đặc biệt chú ý về xe giường nằm:
- Thường xuất phát 19:00-21:00 tối hôm trước
- Đến nơi 15:00-18:00 ngày tiếp theo
- Tiết kiệm 1 đêm khách sạn nhưng ảnh hưởng lịch ngày đầu

Output format:
## So sánh phương tiện di chuyển {origin} → {destination}

### ✈️ Máy bay
- Giá: ...
- Lịch trình: ...

### 🚌 Xe khách giường nằm
- Giá: ...
- Lịch trình: ...

### 🚂 Tàu hỏa
- Giá: ...
- Lịch trình: ...

### 💡 Đề xuất
[Lựa chọn tốt nhất + lý do]
"""


def run_transport_advisor(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: str,
    num_people: int = 2,
    transport_budget: int = 0,
) -> str:
    """
    Standalone transport advisor. Không nằm trong pipeline chính.
    Trả về text so sánh các phương án di chuyển.
    """
    console.print("\n[bold blue]━━━ TRANSPORT ADVISOR ━━━[/bold blue]")

    prompt = TRANSPORT_ADVISOR_PROMPT.format(
        today=get_today(),
        origin=origin,
        destination=destination,
        departure_date=departure_date,
        return_date=return_date,
        num_people=num_people,
        transport_budget=transport_budget or 3_000_000,
    )

    try:
        response = llm.invoke([
            SystemMessage(content=prompt),
            HumanMessage(content="Tìm và so sánh các phương án di chuyển. Dùng web_search để lấy giá thực tế."),
        ])
        result = _to_text(response.content).strip()
        console.print(f"  [green]✓ Transport advice generated ({len(result)} chars)[/green]")
        return result
    except Exception as e:
        console.print(f"[red]  ✗ Error: {e}[/red]")
        return f"Lỗi khi tìm phương tiện: {e}"
