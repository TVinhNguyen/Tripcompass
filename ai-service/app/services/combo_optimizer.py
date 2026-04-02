"""
app/services/combo_optimizer.py

So sánh combo vs mua lẻ để tìm phương án tốt nhất.

Combo không chỉ là về tiền — cũng về CONVENIENCE và EXPERIENCE:
  - Ở Vinpearl Melia → tắm biển riêng, không chen lấn
  - Priority access → không xếp hàng
  - Breakfast buffet included → tiết kiệm buổi sáng
  - Transfer included → không lo Grab

Vì vậy optimizer không chỉ so giá — còn tính "value score".
"""

from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class ComboOption:
    """1 combo cụ thể từ research data."""
    name:               str
    provider:           str               # "Vinpearl", "Klook", "local_tour"
    price_per_person:   int               # VND
    price_total:        int               # VND cho cả nhóm
    num_people:         int

    # Những gì combo bao gồm
    includes:           list[str]         # ["VinWonders", "hotel 2 đêm", "breakfast"]
    duration_days:      int = 1           # Combo kéo dài mấy ngày
    requires_overnight: bool = False      # Combo cần ngủ lại tại resort?

    # Convenience benefits — không tính được bằng tiền
    benefits: list[str] = field(default_factory=list)
    # VD: ["priority boarding", "breakfast buffet", "private beach", "free transfer"]

    # Booking info
    book_in_advance_days: int = 0         # Cần đặt trước bao nhiêu ngày
    booking_url:          str = ""
    source:               str = ""


@dataclass
class ItemizedCost:
    """Chi phí nếu mua lẻ từng thứ trong combo."""
    breakdown:     dict[str, int]         # {"VinWonders": 1_050_000, "hotel": 800_000}
    total_per_person: int
    total_for_group:  int
    missing_items:    list[str]           # Những item trong combo không có giá lẻ


@dataclass
class ComboAnalysis:
    """Kết quả phân tích 1 combo."""
    combo:               ComboOption
    itemized:            ItemizedCost

    # So sánh tài chính
    savings_per_person:  int              # âm = combo đắt hơn
    savings_total:       int
    savings_pct:         float            # % tiết kiệm so với mua lẻ

    # Overlap với lịch trình đã chọn
    overlap_items:       list[str]        # ["VinWonders"] — đã có trong schedule
    overlap_count:       int

    # Value score (0-100)
    # Tính cả tiền tiết kiệm + convenience benefits + efficiency
    value_score:         float

    # Enhanced scoring fields
    effective_cost:      int = 0          # price - value(included_meals + included_transport)
    time_saved_min:      int = 0          # estimated minutes saved vs DIY
    detour_min:          int = 0          # extra travel if combo pickup is far
    includes_lunch:      bool = False     # True if combo provides lunch → skip lunch slot
    includes_transport:  bool = False     # True if combo provides pickup/dropoff

    # Recommendation
    recommended:         bool = False
    reason:              str = ""


# ---------------------------------------------------------------------------
# Benefit scoring — convert qualitative benefits thành số
# ---------------------------------------------------------------------------

BENEFIT_SCORES: dict[str, int] = {
    # High value (tiết kiệm thời gian đáng kể)
    "priority boarding":     15,
    "priority access":       15,
    "early entry":           12,
    "private beach":         12,
    "free transfer":         10,
    "airport pickup":        10,

    # Medium value
    "breakfast buffet":       8,
    "breakfast included":     6,
    "free breakfast":         6,
    "private pool":           8,
    "sea view room":          5,
    "free wifi":              2,

    # Convenience
    "guided tour":            5,
    "english guide":          4,
    "insurance included":     3,
    "luggage storage":        3,
}


def _score_benefits(benefits: list[str]) -> int:
    """Tính tổng điểm từ convenience benefits."""
    total = 0
    for b in benefits:
        b_lower = b.lower()
        for keyword, score in BENEFIT_SCORES.items():
            if keyword in b_lower:
                total += score
                break  # mỗi benefit chỉ tính 1 lần
    return min(total, 50)  # cap ở 50 điểm


# ---------------------------------------------------------------------------
# Main optimizer
# ---------------------------------------------------------------------------

class ComboOptimizer:
    """
    So sánh combos vs mua lẻ và đề xuất phương án tối ưu.

    Usage:
        optimizer = ComboOptimizer(
            combos_text=research["combos"],
            attractions=selected_attractions,
            activity_budget=activity_budget,
            num_people=num_people,
        )
        result = optimizer.get_best_option()
    """

    def __init__(
        self,
        combos_text:       str,
        attractions:       list[dict],     # đã selected từ decision_engine
        activity_budget:   int,
        num_people:        int,
        min_savings_pct:   float = 0.0,    # 0% = recommend nếu combo có benefit dù giá bằng
        min_overlap:       int   = 1,      # Combo phải cover ít nhất N điểm đã chọn
    ):
        self.combos_text     = combos_text
        self.attractions     = attractions
        self.activity_budget = activity_budget
        self.num_people      = num_people
        self.min_savings_pct = min_savings_pct
        self.min_overlap     = min_overlap

        # Index tên attractions đã chọn để check overlap
        self.selected_names: set[str] = {
            a["name"].lower() for a in attractions
        }

    def parse_combos(self) -> list[ComboOption]:
        """
        Parse combos từ research text.
        Hỗ trợ format ### Header từ LLM output.
        """
        combos: list[ComboOption] = []

        blocks = re.split(r'\n###\s+', self.combos_text)
        for block in blocks[1:]:
            lines  = block.strip().split('\n')
            name   = re.sub(r'\*+|\d+\.\s*', '', lines[0]).strip()

            price_per_person = 0
            price_total      = 0
            includes:  list[str] = []
            benefits:  list[str] = []
            provider   = ""
            source     = ""
            duration   = 1
            overnight  = False
            advance    = 0

            for line in lines[1:]:
                l = line.strip().lstrip('- *')
                l_lower = l.lower()

                # Giá/người
                if re.search(r'giá|price|cost', l_lower):
                    m = re.search(r'(\d[\d,\.]+)\s*(?:VND|vnd)', l)
                    if m:
                        v = int(m.group(1).replace(',','').replace('.',''))
                        if v < 10_000_000:   # sanity: không phải tổng trip
                            price_per_person = v
                            price_total      = v * self.num_people

                # Bao gồm
                if re.search(r'includes?|bao gồm|gồm có', l_lower):
                    includes_raw = re.sub(r'\*+|includes?:|bao gồm:|gồm có:', '', l, flags=re.IGNORECASE)
                    includes = [x.strip() for x in re.split(r'[,;+]', includes_raw) if x.strip()]

                # Benefits đặc biệt
                for bkw in BENEFIT_SCORES:
                    if bkw in l_lower:
                        benefits.append(bkw)

                # Provider / source
                if re.search(r'nguồn|source|provider|by\b', l_lower):
                    src_m = re.search(r'(?:nguồn|source|provider|by)\s*[:：]\s*(.+)', l, re.IGNORECASE)
                    if src_m:
                        source = src_m.group(1).strip()

                # Duration
                dur_m = re.search(r'(\d+)\s*ngày', l_lower)
                if dur_m:
                    duration = int(dur_m.group(1))

                # Overnight
                if any(w in l_lower for w in ['ngủ', 'overnight', 'đêm', 'resort stay']):
                    overnight = True

                # Đặt trước
                adv_m = re.search(r'đặt trước\s*(\d+)', l_lower)
                if adv_m:
                    advance = int(adv_m.group(1))

            # Infer benefits từ includes
            for item in includes:
                item_lower = item.lower()
                if any(w in item_lower for w in ['breakfast', 'bữa sáng', 'ăn sáng']):
                    benefits.append('breakfast included')
                if any(w in item_lower for w in ['transfer', 'đưa đón', 'shuttle']):
                    benefits.append('free transfer')

            benefits = list(set(benefits))  # dedup

            if name and price_per_person > 0:
                combos.append(ComboOption(
                    name=name, provider=provider,
                    price_per_person=price_per_person,
                    price_total=price_total,
                    num_people=self.num_people,
                    includes=includes, benefits=benefits,
                    duration_days=duration,
                    requires_overnight=overnight,
                    book_in_advance_days=advance,
                    source=source,
                ))

        return combos

    def _get_itemized_cost(self, combo: ComboOption) -> ItemizedCost:
        """
        Tính chi phí mua lẻ từng item trong combo.
        So với attractions đã có giá từ research.
        """
        breakdown: dict[str, int] = {}
        missing:   list[str]      = []

        for item in combo.includes:
            item_lower = item.lower()
            matched    = False

            for attr in self.attractions:
                attr_name = attr.get("name", "").lower()
                # Fuzzy match: item trong includes có chứa tên attraction?
                if (attr_name in item_lower or
                    any(word in item_lower for word in attr_name.split() if len(word) > 3)):
                    price = attr.get("price_per_person", 0) * self.num_people
                    if price > 0:
                        breakdown[attr["name"]] = price
                        matched = True
                        break

            # Hotel estimate nếu combo includes overnight
            if not matched and any(w in item_lower for w in ['hotel', 'resort', 'đêm', 'stay', 'nghỉ']):
                # Dùng estimate 600k/đêm nếu không có giá thực
                nights = combo.duration_days - 1 if combo.duration_days > 1 else 1
                breakdown["Hotel (estimate)"] = 600_000 * nights
                matched = True

            if not matched and item.strip():
                missing.append(item)

        total_per_person = sum(breakdown.values()) // max(self.num_people, 1)
        total_for_group  = sum(breakdown.values())

        return ItemizedCost(
            breakdown=breakdown,
            total_per_person=total_per_person,
            total_for_group=total_for_group,
            missing_items=missing,
        )

    def _check_overlap(self, combo: ComboOption) -> list[str]:
        """Kiểm tra combo có bao gồm bao nhiêu điểm đã có trong schedule."""
        overlaps: list[str] = []
        for item in combo.includes:
            item_lower = item.lower()
            for sel_name in self.selected_names:
                if (sel_name in item_lower or
                    any(word in item_lower for word in sel_name.split() if len(word) > 3)):
                    overlaps.append(item)
                    break
        return overlaps

    def _compute_value_score(
        self,
        savings_pct:    float,
        overlap_count:  int,
        benefit_score:  int,
        effective_cost: int = 0,
        time_saved_min: int = 0,
    ) -> float:
        """
        Tính value score 0-100.

        Thành phần:
        - Savings   (0-30 điểm): tiết kiệm được bao nhiêu %
        - Overlap   (0-20 điểm): combo cover bao nhiêu điểm đã chọn
        - Benefits  (0-20 điểm): convenience value
        - Efficiency(0-30 điểm): effective_cost + time_saved value
        """
        # Savings score (0-30)
        if savings_pct >= 30:
            savings_s = 30
        elif savings_pct >= 15:
            savings_s = 22
        elif savings_pct >= 5:
            savings_s = 15
        elif savings_pct >= 0:
            savings_s = 8
        else:
            savings_s = max(-15, int(savings_pct))

        # Overlap score (mỗi item overlap = 7 điểm, max 20)
        overlap_s = min(overlap_count * 7, 20)

        # Benefit score (scale về 0-20)
        benefit_s = min(int(benefit_score * 0.4), 20)

        # Efficiency score (0-30): value of time saved vs effective cost
        time_value = time_saved_min * 5_000  # 5k VND per minute saved
        if effective_cost > 0:
            efficiency = time_value / effective_cost
            efficiency_s = min(int(efficiency * 30), 30)
        else:
            efficiency_s = 15 if time_saved_min > 30 else 0

        return max(0.0, savings_s + overlap_s + benefit_s + efficiency_s)

    def analyze(self, combo: ComboOption) -> ComboAnalysis:
        """Phân tích 1 combo và tính toán recommendation."""
        itemized = self._get_itemized_cost(combo)
        overlaps = self._check_overlap(combo)

        savings_total      = itemized.total_for_group - combo.price_total
        savings_per_person = savings_total // max(self.num_people, 1)
        savings_pct        = (savings_total / max(itemized.total_for_group, 1)) * 100

        benefit_score = _score_benefits(combo.benefits)

        # --- Enhanced fields ---
        # Check if combo provides lunch or transport
        all_text = " ".join(combo.includes + combo.benefits).lower()
        includes_lunch = any(
            w in all_text for w in ["lunch", "bữa trưa", "trưa", "ăn trưa"]
        )
        includes_transport = any(
            w in all_text for w in ["transfer", "đưa đón", "shuttle", "pickup", "free transfer"]
        )

        # Value of included services
        meal_value      = 100_000 * self.num_people if includes_lunch else 0
        transport_value = 200_000 if includes_transport else 0
        effective_cost  = max(0, combo.price_total - meal_value - transport_value)

        # Time saved: no queueing + no self-arrange transport
        time_saved_min = 30 + (45 if includes_transport else 0)

        value_score = self._compute_value_score(
            savings_pct, len(overlaps), benefit_score, effective_cost, time_saved_min
        )

        # Điều kiện recommend
        within_budget = combo.price_total <= self.activity_budget
        has_overlap   = len(overlaps) >= self.min_overlap
        worth_it      = (
            savings_pct >= self.min_savings_pct or
            benefit_score >= 20
        )

        recommended = within_budget and has_overlap and worth_it

        # Lý do
        if not within_budget:
            reason = f"Vượt activity budget ({combo.price_total:,} > {self.activity_budget:,} VND)"
        elif not has_overlap:
            reason = "Combo không bao gồm điểm nào trong lịch trình đã chọn"
        elif savings_total > 0:
            reason = (
                f"Tiết kiệm {savings_total:,} VND ({savings_pct:.0f}%) so với mua lẻ"
                + (f" + {', '.join(combo.benefits[:2])}" if combo.benefits else "")
            )
        elif benefit_score >= 20:
            reason = (
                f"Đắt hơn {abs(savings_total):,} VND nhưng có: "
                f"{', '.join(combo.benefits[:3])}"
            )
        else:
            reason = "Không đủ lợi thế so với mua lẻ"

        return ComboAnalysis(
            combo=combo,
            itemized=itemized,
            savings_per_person=savings_per_person,
            savings_total=savings_total,
            savings_pct=savings_pct,
            overlap_items=overlaps,
            overlap_count=len(overlaps),
            value_score=value_score,
            effective_cost=effective_cost,
            time_saved_min=time_saved_min,
            includes_lunch=includes_lunch,
            includes_transport=includes_transport,
            recommended=recommended,
            reason=reason,
        )

    def get_best_option(self) -> dict:
        """
        So sánh tất cả combos và trả về recommendation.

        Returns:
        {
            "use_combo": bool,
            "best_combo": ComboAnalysis | None,
            "all_analyses": list[ComboAnalysis],
            "summary": str,             # Human-readable summary
            "schedule_impact": str,     # Ảnh hưởng đến lịch trình
        }
        """
        combos   = self.parse_combos()
        analyses = [self.analyze(c) for c in combos]

        # Sort by value_score descending
        analyses.sort(key=lambda x: x.value_score, reverse=True)

        recommended = [a for a in analyses if a.recommended]
        best        = recommended[0] if recommended else None

        if best:
            combo    = best.combo
            schedule = ""
            if combo.requires_overnight:
                schedule = (
                    f"Xếp {combo.name} vào ngày {combo.duration_days} ngày liên tiếp. "
                    f"Check-in resort → tham quan → ngủ lại → sáng hôm sau tiếp tục."
                )
            else:
                schedule = (
                    f"Xếp {combo.name} vào 1 ngày đầy đủ. "
                    f"Bắt đầu sớm (8:00) để tận dụng hết thời gian."
                )

            summary = (
                f"✅ Đề xuất combo: {combo.name}\n"
                f"   Giá combo: {combo.price_total:,} VND "
                f"({combo.price_per_person:,}/người)\n"
                f"   Bao gồm: {', '.join(combo.includes[:4])}\n"
                f"   Lý do: {best.reason}\n"
                f"   Value score: {best.value_score:.0f}/100"
            )
        else:
            schedule = "Mua vé lẻ từng điểm theo lịch trình đã sắp xếp."
            summary  = (
                "ℹ️ Không tìm thấy combo tốt hơn mua lẻ.\n"
                "   Tiếp tục với lịch trình đã chọn."
            )

        return {
            "use_combo":       best is not None,
            "best_combo":      best,
            "all_analyses":    analyses,
            "summary":         summary,
            "schedule_impact": schedule,
        }


# ---------------------------------------------------------------------------
# Convenience function — dùng trong decision_engine
# ---------------------------------------------------------------------------

def evaluate_combos(
    combos_text:     str,
    attractions:     list[dict],
    activity_budget: int,
    num_people:      int,
) -> dict:
    """
    One-shot function: parse + analyze + recommend.
    Dùng trực tiếp trong decision_engine.py.

    Example:
        result = evaluate_combos(
            combos_text=research["combos"],
            attractions=selected_attrs,
            activity_budget=4_000_000,
            num_people=2,
        )
        if result["use_combo"]:
            combo = result["best_combo"].combo
            print(f"Dùng combo: {combo.name} — {combo.price_total:,} VND")
    """
    optimizer = ComboOptimizer(
        combos_text=combos_text,
        attractions=attractions,
        activity_budget=activity_budget,
        num_people=num_people,
    )
    return optimizer.get_best_option()