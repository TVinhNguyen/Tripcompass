// =============================================================================
// TripCompass — Planner-AI tool label map
// Source of truth: docs/integration/03-AI-PLANNER-FLOW.md §6
// =============================================================================

export type ToolLabel = {
  vi: string;
  icon: string;
};

export const TOOL_LABELS: Record<string, ToolLabel> = {
  get_places:          { vi: "Đang tra cứu địa điểm tham quan...", icon: "🏝️" },
  get_food_venues:     { vi: "Đang tìm món ngon...",               icon: "🍜" },
  get_combos:          { vi: "Đang gợi ý combo tour...",           icon: "🎁" },
  get_weather:         { vi: "Đang kiểm tra thời tiết...",         icon: "☀️" },
  get_real_prices:     { vi: "Đang cập nhật giá...",               icon: "💵" },
  search_hotels:       { vi: "Đang tìm khách sạn...",              icon: "🏨" },
  search_flights:      { vi: "Đang tìm chuyến bay...",             icon: "✈️" },
  create_travel_plan:  { vi: "Đang lên lịch trình chi tiết...",    icon: "📅" },
};

/** Return label for a tool name, falling back gracefully */
export function getToolLabel(toolName: string): ToolLabel {
  return (
    TOOL_LABELS[toolName] ?? { vi: `Đang xử lý (${toolName})...`, icon: "⚙️" }
  );
}

// ---------------------------------------------------------------------------
// Suggested chips shown above the chat input
// ---------------------------------------------------------------------------

export const CHAT_SUGGESTIONS: string[] = [
  "Đi Đà Nẵng 3 ngày cho 2 người, ngân sách 5tr",
  "Quán ăn ngon nhất Đà Lạt",
  "Combo tour tiết kiệm Phú Quốc",
  "Lịch trình cho cặp đôi Hội An 2N1Đ",
  "Đi Sapa đầu tháng 12 nên mặc gì?",
];
