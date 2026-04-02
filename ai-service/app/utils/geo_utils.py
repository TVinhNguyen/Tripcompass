"""
app/utils/geo_utils.py

Geo-clustering cho attractions dựa trên address keywords.
Không cần coordinates — chỉ cần text matching từ địa chỉ.

Nguyên tắc:
- Mỗi area có keyword list
- Địa điểm match nhiều keyword nhất → thuộc area đó
- Địa điểm cùng area → nên đi cùng buổi (tiết kiệm thời gian di chuyển)
"""

from __future__ import annotations
from typing import Literal

# ---------------------------------------------------------------------------
# Area definitions — thêm city mới vào đây
# ---------------------------------------------------------------------------

AreaKey = str

# Mỗi entry: (area_key, [keywords], time_cost_from_center_minutes)
# time_cost dùng để estimate travel time giữa các điểm
AREA_CONFIGS: dict[str, dict] = {

    "nha trang": {
        "north": {
            "keywords": [
                "tháp bà", "thap ba", "po nagar", "ponagar",
                "hòn chồng", "hon chong", "xóm bóng", "xom bong",
                "vinh phuoc", "vĩnh phước", "bắc nha trang",
                "đường 2/4", "hai thang tu", "cầu xóm bóng",
            ],
            "travel_min": 15,   # phút từ trung tâm
            "note": "Khu đền tháp Chăm + Hòn Chồng — đi sáng sớm tránh nóng",
        },
        "center": {
            "keywords": [
                "trần phú", "tran phu", "lộc thọ", "loc tho",
                "nhà thờ đá", "nha tho da", "cathedral",
                "chùa long sơn", "chua long son", "long son pagoda",
                "phương sài", "phuong sai", "chợ đầm", "cho dam",
                "yersin", "nguyễn thiện thuật", "nguyen thien thuat",
                "lý tự trọng", "ly tu trong", "bãi biển nha trang",
                "quảng trường", "quang truong", "city square",
                "thành phố nha trang", "trung tâm",
            ],
            "travel_min": 0,
            "note": "Trung tâm — kết hợp được với bất kỳ area nào",
        },
        "south": {
            "keywords": [
                "cầu đá", "cau da", "vinh nguyen", "vĩnh nguyên",
                "viện hải dương", "vien hai duong", "oceanographic",
                "bãi dài", "bai dai cam ranh",
                "ngọc hiệp", "vĩnh hải",
            ],
            "travel_min": 20,
            "note": "Khu bảo tàng biển phía nam trung tâm",
        },
        "island": {
            "keywords": [
                "hòn tre", "hon tre", "vinpearl", "vinwonders",
                "melia", "vinharbour", "vin harbour",
                "cáp treo", "cap treo", "cable car", "cảng cầu đá",
                "đảo hòn tre", "resort đảo",
                # Các đảo nhỏ trong vịnh Nha Trang — cần tàu, nửa-nguyên ngày
                "hòn mun", "hon mun",
                "hòn tằm", "hon tam",
                "vịnh nha trang", "vinh nha trang",
            ],
            "travel_min": 45,   # bao gồm cả cable car / tàu
            "note": "Cần nửa ngày đến cả ngày — không kết hợp điểm khác",
            "full_day": True,
        },
        "far_outskirts": {
            "keywords": [
                "ba hồ", "ba ho", "suối ba hồ",
                "yang bay", "thác yang bay",
                "đèo cả", "ninh hòa", "ninh hoa",
                "diên khánh", "khanh vinh",
                "cam ranh",
                # Các đảo xa — cần cả ngày + di chuyển dài
                "điệp sơn", "diep son",
                "vân phong", "van phong",
                "bình ba", "binh ba",
            ],
            "travel_min": 60,
            "note": "Xa trung tâm — nên xếp riêng 1 ngày, khởi hành sớm",
            "full_day": True,
        },
    },

    "da nang": {
        "center": {
            "keywords": [
                "cầu rồng", "bãi biển mỹ khê", "my khe",
                "bảo tàng chăm", "museum of cham",
                "han market", "chợ hàn", "trần phú",
            ],
            "travel_min": 0,
        },
        "ba na hills": {
            "keywords": ["bà nà", "ba na", "golden bridge", "cầu vàng"],
            "travel_min": 60,
            "full_day": True,
        },
        "marble mountains": {
            "keywords": ["ngũ hành sơn", "ngu hanh son", "marble mountain"],
            "travel_min": 25,
        },
        "hoi an": {
            "keywords": ["hội an", "hoi an", "ancient town", "phố cổ"],
            "travel_min": 45,
            "note": "Thường đi cả ngày",
        },
    },

    "ha noi": {
        "hoan kiem": {
            "keywords": [
                "hoàn kiếm", "hoan kiem", "hồ gươm", "ho guom",
                "phố cổ", "old quarter", "đinh lễ",
            ],
            "travel_min": 0,
        },
        "west lake": {
            "keywords": ["hồ tây", "ho tay", "tây hồ", "tay ho", "trúc bạch"],
            "travel_min": 20,
        },
        "ha dong": {
            "keywords": ["hà đông", "ha dong", "văn miếu", "van mieu"],
            "travel_min": 30,
        },
    },
}


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

GENERIC_AREA_CONFIG: dict = {
    "center": {
        "keywords": [
            "trung tâm", "trung tam", "chợ", "cho", "bảo tàng", "museum",
            "nhà thờ", "nha tho", "phố cổ", "pho co", "quảng trường",
            "city center", "walking street", "downtown", "trung tâm thành phố",
            "phố đi bộ", "pho di bo",
        ],
        "travel_min": 0,
        "note": "Trung tâm thành phố",
    },
    "nature": {
        "keywords": [
            "thác", "thac", "waterfall", "suối", "suoi", "núi", "nui",
            "mountain", "đèo", "deo", "rừng", "rung", "forest",
            "vườn quốc gia", "national park", "hồ", "ho", "lake",
            "hang động", "hang dong", "cave",
        ],
        "travel_min": 45,
        "note": "Thiên nhiên — nên đi sáng sớm, mất nửa ngày đến cả ngày",
        "full_day": True,
    },
    "island": {
        "keywords": [
            "đảo", "dao", "island", "hòn", "hon", "cáp treo", "cap treo",
            "cable car", "vịnh", "vinh", "bay",
        ],
        "travel_min": 60,
        "note": "Đảo — cần cả ngày, bao gồm di chuyển",
        "full_day": True,
    },
    "beach": {
        "keywords": [
            "bãi biển", "bai bien", "beach", "biển", "bien", "resort",
            "ven biển", "bờ biển",
        ],
        "travel_min": 15,
        "note": "Ven biển — chỉ buổi sáng/chiều (06:00-17:00)",
    },
    "outskirts": {
        "keywords": [
            "ngoại ô", "ngoai o", "huyện", "huyen", "cách trung tâm",
            "thị xã", "suburban", "vùng ven",
        ],
        "travel_min": 30,
        "note": "Ngoại ô — kết hợp 1-2 điểm cùng khu vực",
    },
    "temple": {
        "keywords": [
            "chùa", "chua", "pagoda", "đền", "den", "temple", "tháp", "thap",
            "tower", "miếu", "mieu", "đình", "dinh", "lăng", "lang", "tomb",
        ],
        "travel_min": 10,
        "note": "Đền chùa — buổi sáng hoặc chiều",
    },
}


def get_area_config(destination: str) -> dict:
    """Lấy area config cho destination. Fallback về GENERIC_AREA_CONFIG."""
    dest_lower = destination.lower().strip()
    for city_key, config in AREA_CONFIGS.items():
        if city_key in dest_lower or dest_lower in city_key:
            return config
    return GENERIC_AREA_CONFIG


def assign_area(address: str, destination: str) -> AreaKey:
    """
    Gán area cho 1 địa điểm dựa trên address text.

    Thuật toán:
    1. Lowercase address
    2. Với mỗi area: đếm số keyword match
    3. Area có nhiều match nhất → win
    4. Tie → ưu tiên area có travel_min thấp hơn (trung tâm hơn)
    """
    area_config = get_area_config(destination)
    if not area_config:
        return "unknown"

    addr_lower = address.lower()
    scores: dict[str, int] = {}

    for area_key, area_data in area_config.items():
        score = 0
        for kw in area_data.get("keywords", []):
            if kw.lower() in addr_lower:
                score += 1
        if score > 0:
            scores[area_key] = score

    if not scores:
        return "unknown"

    # Chọn area có score cao nhất, tie-break bằng travel_min thấp nhất
    best_area = max(
        scores,
        key=lambda a: (
            scores[a],
            -area_config[a].get("travel_min", 999)
        )
    )
    return best_area  # type: ignore


def cluster_attractions_by_area(
    attractions: list[dict],
    destination: str,
) -> dict[str, list[dict]]:
    """
    Nhóm attractions theo area.

    Input: list of {name, address, price_per_person, hours, area, full_day, ...}
    Output: {"north": [...], "island": [...], "center": [...]}

    Nếu attraction đã có field 'area' (từ DB) → dùng luôn, không tính lại.
    Ngược lại → dùng keyword matching từ address/name.
    """
    clusters: dict[str, list[dict]] = {}
    for attr in attractions:
        # Trust DB-provided area if set; fall back to keyword matching
        preset_area = (attr.get("area") or "").strip().lower()
        area = preset_area if preset_area else assign_area(
            attr.get("address", "") + " " + attr.get("name", ""), destination
        )
        attr_with_area = {**attr, "area": area}
        clusters.setdefault(area, []).append(attr_with_area)
    return clusters


def assign_attractions_to_days(
    clusters: dict[str, list[dict]],
    num_days: int,
    destination: str,
) -> dict[int, list[dict]]:
    """
    Phân công attractions vào ngày dựa trên:
    - Ngày 1 (check-in, đến muộn): nhẹ nhàng, gần center
    - Ngày cuối (check-out sáng): chỉ sáng, nhẹ
    - Island / far_outskirts: cần nguyên ngày riêng
    - Cùng area → xếp cùng ngày (tiết kiệm di chuyển)

    Returns: {1: [attr1], 2: [attr2, attr3], 3: [attr4], ...}
    """
    area_config   = get_area_config(destination)
    schedule: dict[int, list[dict]] = {i: [] for i in range(1, num_days + 1)}

    # Ngày 1 và ngày cuối là "restricted days"
    day1     = 1
    last_day = num_days

    # Ngày có thể dùng đầy đủ
    full_days     = list(range(2, num_days))       # ngày 2, 3, ...
    # --- Pass 1: island + far_outskirts + attr.full_day chiếm nguyên ngày ---
    full_day_areas = [
        area for area, cfg in area_config.items()
        if cfg.get("full_day")
    ]
    used_full_days: set[int] = set()

    for area, attrs_in_area in clusters.items():
        is_full_day_area = area in full_day_areas
        for attr in attrs_in_area:
            if not (is_full_day_area or attr.get("full_day")):
                continue
            if full_days:
                # Chọn ngày chưa được dùng, tránh ngày đã có full_day khác
                available = [d for d in full_days if d not in used_full_days]
                if not available:
                    available = full_days  # fallback: stack nếu hết ngày
                target_day = available[0]
                schedule[target_day].append({**attr, "full_day": True})
                used_full_days.add(target_day)
                # Mỗi full_day attraction chiếm 1 ngày riêng
                full_days = [d for d in full_days if d != target_day]

    # --- Pass 2: các areas thông thường, nhóm theo area vào cùng ngày ---
    normal_areas = [
        area for area in clusters
        if area not in full_day_areas and area != "unknown"
    ]

    remaining_days = [d for d in range(2, num_days) if d not in used_full_days]

    for area in normal_areas:
        attrs_in_area = clusters[area]
        # Max 2 attractions/ngày cho normal areas
        for i, attr in enumerate(attrs_in_area):
            if not remaining_days:
                # Fallback: thêm vào ngày cuối nếu hết ngày
                schedule[last_day].append(attr)
                continue
            n_remaining = len(remaining_days)
            target_day = remaining_days[i // 2 % n_remaining]
            if len(schedule[target_day]) < 2:
                schedule[target_day].append(attr)
            else:
                # Ngày này đã đủ 2 điểm → chuyển sang ngày kế tiếp
                next_idx = (i // 2 + 1) % n_remaining
                schedule[remaining_days[next_idx]].append(attr)

    # --- Pass 3: unknown area → trải đều vào các ngày còn trống ---
    if "unknown" in clusters:
        free_days = [
            d for d in range(2, num_days)
            if len(schedule[d]) < 2
        ]
        for i, attr in enumerate(clusters["unknown"]):
            if free_days:
                schedule[free_days[i % len(free_days)]].append(attr)
            else:
                # Fallback cho lịch ngắn (1-2 ngày) hoặc đã đầy
                target_day = day1 if len(schedule[day1]) < 2 else last_day
                schedule[target_day].append(attr)

    # --- Ngày 1: chỉ center/nhẹ nếu còn slot ---
    center_attrs = [
        a for a in clusters.get("center", [])
        if not any(a in day_list for day_list in schedule.values())
    ]
    if center_attrs:
        schedule[day1].append(center_attrs[0])  # 1 điểm nhẹ ngày đầu

    return schedule


def get_nearest_food(
    food_venues: list[dict],
    area: str,
    destination: str,
    meal_type: Literal["breakfast", "lunch", "dinner"] = "lunch",
) -> list[dict]:
    """
    Gợi ý quán ăn gần một area nhất định.

    Logic:
    - Tìm quán có address match với area keywords
    - Nếu không có → fallback về center venues
    - Ưu tiên: quán phù hợp với meal_type (sáng vs trưa vs tối)
    """
    area_config = get_area_config(destination)
    area_keywords = area_config.get(area, {}).get("keywords", [])

    # Score từng quán theo distance to area
    scored: list[tuple[int, dict]] = []
    for venue in food_venues:
        addr  = (venue.get("address", "") + " " + venue.get("name", "")).lower()
        score = sum(1 for kw in area_keywords if kw.lower() in addr)

        # Bonus: quán phù hợp với bữa ăn
        notes = venue.get("specialty", "").lower() + venue.get("notes", "").lower()
        if meal_type == "breakfast" and any(
            w in notes for w in ["sáng", "breakfast", "7:00", "6:00", "bún", "bánh mì"]
        ):
            score += 2
        elif meal_type == "dinner" and any(
            w in notes for w in ["tối", "dinner", "19:00", "hải sản", "nướng", "lẩu"]
        ):
            score += 2

        scored.append((score, venue))

    # Sort: score cao nhất trước
    scored.sort(key=lambda x: x[0], reverse=True)
    result = [v for _, v in scored if _ > 0]

    # Fallback nếu không có quán nào match area: trả về TẤT CẢ (theo rank)
    # để build_food_map có thể lọc unused venues từ toàn bộ danh sách
    if not result:
        result = [v for _, v in scored]

    return result  # caller (build_food_map) sẽ chọn top-1 sau khi filter unused


def build_food_map(
    food_venues: list[dict],
    daily_schedule: dict[int, list[dict]],
    destination: str,
) -> dict[int, dict[str, list[dict]]]:
    """
    Map quán ăn vào từng ngày dựa trên area của activities ngày đó.
    Đảm bảo KHÔNG lặp cùng quán cho cùng bữa ở các ngày khác nhau.

    Returns:
    {
        1: {"breakfast": [...], "lunch": [...], "dinner": [...]},
        2: {"breakfast": [...], "lunch": [...], "dinner": [...]},
    }
    """
    food_map: dict[int, dict] = {}
    # Track venues already used per meal type across days
    used_per_meal: dict[str, set[str]] = {"breakfast": set(), "lunch": set(), "dinner": set()}
    # Track venues used globally (any meal, any day) — each venue appears at most once
    used_global: set[str] = set()

    for day_n in sorted(daily_schedule.keys()):
        attrs = daily_schedule[day_n]
        primary_area = attrs[0].get("area", "center") if attrs else "center"

        day_meals: dict[str, list[dict]] = {}
        used_this_day: set[str] = set()  # prevents same venue as lunch AND dinner same day

        for meal_type, area in [
            ("breakfast", "center"),
            ("lunch",     primary_area),
            ("dinner",    primary_area),
        ]:
            candidates = get_nearest_food(food_venues, area, destination, meal_type)
            # Filter: not used globally, not used today
            fresh = [
                v for v in candidates
                if v["name"] not in used_global and v["name"] not in used_this_day
            ]
            # Soft fallback: allow cross-day repeats but not same-day repeats
            if not fresh:
                fresh = [v for v in candidates if v["name"] not in used_this_day]
            # Hard fallback: any candidate
            if not fresh:
                fresh = candidates
            if fresh:
                chosen = fresh[0]
                used_per_meal[meal_type].add(chosen["name"])
                used_global.add(chosen["name"])
                used_this_day.add(chosen["name"])
            day_meals[meal_type] = fresh

        food_map[day_n] = day_meals

    return food_map


# ---------------------------------------------------------------------------
# Travel-time matrix
# ---------------------------------------------------------------------------

def estimate_travel_min(area_from: str, area_to: str, destination: str) -> int:
    """Estimate travel time in minutes between two areas."""
    if area_from == area_to:
        return 5  # same area, just walking
    config = get_area_config(destination)
    t_from = config.get(area_from, {}).get("travel_min", 15)
    t_to   = config.get(area_to,   {}).get("travel_min", 15)
    # Average heuristic — conservative but not worst-case
    return max(10, (t_from + t_to) // 2)


def compute_day_travel_total(slots: list, destination: str) -> int:
    """Sum estimated travel minutes between consecutive activities in a day."""
    areas = [s.attraction.area for s in slots if getattr(s, "attraction", None)]
    total = 0
    for i in range(1, len(areas)):
        total += estimate_travel_min(areas[i - 1], areas[i], destination)
    return total


# ---------------------------------------------------------------------------
# Debug helper
# ---------------------------------------------------------------------------

def describe_schedule(
    daily_schedule: dict[int, list[dict]],
    food_map: dict[int, dict],
) -> str:
    """In ra schedule dạng readable để debug."""
    lines = []
    for day_n in sorted(daily_schedule.keys()):
        attrs = daily_schedule[day_n]
        lines.append(f"\nNgày {day_n}:")
        if attrs:
            for a in attrs:
                tag = " [full day]" if a.get("full_day") else ""
                lines.append(f"  📍 {a['name']} ({a.get('area','?')}){tag}")
        else:
            lines.append("  📍 (tự do / nghỉ ngơi)")

        meals = food_map.get(day_n, {})
        for meal_type in ["breakfast", "lunch", "dinner"]:
            venues = meals.get(meal_type, [])
            if venues:
                v = venues[0]
                lines.append(f"  🍜 {meal_type}: {v['name']} — {v.get('address','')}")

    return "\n".join(lines)