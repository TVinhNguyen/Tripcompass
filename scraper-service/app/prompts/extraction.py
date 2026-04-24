"""
Prompt templates for LLM extraction and gap-filling.
"""

ATTRACTION_EXTRACT_PROMPT = """
Bạn là travel data extractor. Từ kết quả tìm kiếm về điểm tham quan tại {destination}, Việt Nam,
hãy extract JSON array các attraction objects.

QUY TẮC:
- Chỉ extract địa điểm thực sự (chùa, bãi biển, bảo tàng, công viên, thác nước...)
- Mỗi object PHẢI có: name (tên tiếng Việt), address (địa chỉ đầy đủ: số nhà, đường, phường/xã, thành phố)
- base_price: giá vé vào cửa (VND/người, integer). Đặt 0 nếu miễn phí. null nếu không biết.
- is_free: true nếu miễn phí vào cửa
- hours: giờ mở cửa (ví dụ "07:00-17:00") hoặc null
- full_day: true nếu cần cả ngày (đảo xa, công viên nước, thác xa)
- recommended_duration: thời gian tham quan (phút, ví dụ 60, 90, 120, 180, 360)
- area: khu vực trong thành phố ("center", "north", "south", "island", "far_outskirts") hoặc null
- KHÔNG tự nghĩ ra giá — nếu không tìm thấy giá, để null
- source_url: URL nguồn tìm thấy thông tin
- tags: list tối đa 5 tags mô tả địa điểm, chọn từ:
  ["scenic", "historic", "outdoor", "family-friendly", "cultural", "adventure", "religious", "beach", "mountain", "urban", "nightlife", "nature"]
- must_visit: true nếu địa điểm xuất hiện nhiều lần trong kết quả tìm kiếm, được nhiều nguồn
  đánh giá là "must-see" / "không thể bỏ qua" / "top đầu" / biểu tượng của thành phố.
  false nếu ít được đề cập hoặc chỉ được 1 nguồn nhắc đến.
- priority_score: số nguyên 1-10, đánh giá dựa trên:
  * Tần suất xuất hiện trong kết quả tìm kiếm (nhiều nguồn = điểm cao)
  * Cường độ mô tả ("biểu tượng", "nổi tiếng nhất" > "khá đẹp")
  * So sánh với các địa điểm khác trong cùng kết quả
  Ví dụ: Cầu Rồng Đà Nẵng → 9, Bảo tàng ít biết → 3

Output ONLY valid JSON array, no markdown:
[
  {{
    "name": "...",
    "name_en": "...",
    "address": "...",
    "area": null,
    "base_price": 0,
    "is_free": true,
    "hours": "07:00-17:00",
    "full_day": false,
    "recommended_duration": 90,
    "description": "...",
    "source_url": null,
    "tags": ["scenic", "outdoor"],
    "must_visit": true,
    "priority_score": 8
  }}
]

Kết quả tìm kiếm về {destination}:
{search_results}
"""

FOOD_EXTRACT_PROMPT = """
Bạn là travel data extractor. Từ kết quả tìm kiếm về quán ăn tại {destination}, Việt Nam,
hãy extract JSON array các food venue objects.

QUY TẮC:
- Chỉ extract quán ăn/nhà hàng thực sự có tên cụ thể (không extract tên món ăn chung)
- Mỗi object PHẢI có: name, address (địa chỉ đầy đủ)
- specialty: món đặc sản/đặc trưng của quán
- base_price: giá trung bình/người (VND, integer). null nếu không biết.
- price_min/price_max: khoảng giá/người (VND, integer). null nếu không biết.
- meal_types: array từ ["breakfast", "lunch", "dinner"]
- hours: giờ mở cửa hoặc null
- KHÔNG tự nghĩ ra giá — lấy từ kết quả tìm kiếm
- source_url: URL nguồn
- tags: list tối đa 5 tags, chọn từ:
  ["local", "seafood", "budget", "popular", "traditional", "street-food", "restaurant", "breakfast-spot", "hidden-gem", "tourist-favorite"]
- must_visit: true nếu quán xuất hiện nhiều lần trong kết quả, được đánh giá là nổi tiếng/phải thử.
  false nếu ít được đề cập.
- priority_score: số nguyên 1-10, dựa trên tần suất xuất hiện và mức độ được đề xuất.
  Ví dụ: Quán bún chả cá nổi tiếng nhất thành phố → 8, Quán ít biết → 3

Output ONLY valid JSON array, no markdown:
[
  {{
    "name": "...",
    "address": "...",
    "area": null,
    "specialty": "...",
    "base_price": null,
    "price_min": 30000,
    "price_max": 80000,
    "meal_types": ["lunch", "dinner"],
    "hours": null,
    "description": "...",
    "source_url": null,
    "tags": ["local", "traditional"],
    "must_visit": false,
    "priority_score": 5
  }}
]

Kết quả tìm kiếm về {destination}:
{search_results}
"""

COMBO_EXTRACT_PROMPT = """
Bạn là travel data extractor. Từ kết quả tìm kiếm về tour/combo tại {destination}, Việt Nam,
hãy extract JSON array các combo objects.

QUY TẮC:
- Chỉ extract tour/combo có tên cụ thể và giá thực tế
- price_per_person: giá/người (VND, integer). Bỏ qua nếu không có giá.
- price_per_person phải từ 100,000 đến 5,000,000 VND
- includes: array tên các địa điểm/dịch vụ bao gồm trong combo
- benefits: array lợi ích (ví dụ ["xe đưa đón", "hướng dẫn viên", "bữa trưa"])
- KHÔNG tự nghĩ ra giá

Output ONLY valid JSON array, no markdown:
[
  {{
    "name": "...",
    "provider": null,
    "price_per_person": 500000,
    "includes": ["Địa điểm A", "Địa điểm B"],
    "benefits": ["xe đưa đón", "hướng dẫn viên"],
    "duration_days": 1,
    "requires_overnight": false,
    "book_url": null
  }}
]

Kết quả tìm kiếm về {destination}:
{search_results}
"""

GAP_FILL_PROMPT = """
Từ kết quả tìm kiếm dưới đây, hãy extract CHỈ trường "{field}" cho địa điểm "{name}" tại {destination}.

{field_instruction}

Trả về CHỈ giá trị (string hoặc số), không giải thích. Nếu không tìm thấy, trả về: NOT_FOUND

Kết quả tìm kiếm:
{search_results}
"""

GAP_FILL_INSTRUCTIONS = {
    "base_price": "Trả về giá vé vào cửa (số nguyên VND/người). Ví dụ: 25000",
    "address": "Trả về địa chỉ đầy đủ (số nhà, tên đường, phường/xã, thành phố). Ví dụ: 2 Tháng 4, Vĩnh Phước, Nha Trang",
    "hours": "Trả về giờ mở cửa. Ví dụ: 07:00-17:00",
}

TAGS_EXTRACT_PROMPT = """
Từ các review dưới đây về "{name}" tại {destination}, hãy extract:
1. tags: list tối đa 5 tags mô tả địa điểm (ví dụ: ["scenic", "family-friendly", "historic", "outdoor", "budget"])
2. best_time_of_day: "morning" | "afternoon" | "evening" | "any"

Trả về JSON object:
{{"tags": [...], "best_time_of_day": "..."}}

Reviews:
{reviews}
"""
