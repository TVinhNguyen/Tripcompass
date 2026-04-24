import {
  Utensils,
  Camera,
  Bus,
  Hotel,
  Sparkles,
} from "lucide-react";
import type { Activity } from "./types";

// ── Type decorators ──────────────────────────────────────────────────────────

export const TYPE_ICONS: Record<string, React.ReactNode> = {
  food:          <Utensils   className="w-3.5 h-3.5" />,
  attraction:    <Camera     className="w-3.5 h-3.5" />,
  transport:     <Bus        className="w-3.5 h-3.5" />,
  accommodation: <Hotel      className="w-3.5 h-3.5" />,
  activity:      <Sparkles   className="w-3.5 h-3.5" />,
};

export const TYPE_COLOR: Record<string, { bg: string; text: string; soft: string }> = {
  food:          { bg: "#c4785a", text: "#c4785a", soft: "rgba(196,120,90,0.12)"  },
  attraction:    { bg: "#3d5a3d", text: "#3d5a3d", soft: "rgba(61,90,61,0.12)"   },
  transport:     { bg: "#8b8378", text: "#8b8378", soft: "rgba(139,131,120,0.14)" },
  accommodation: { bg: "#d4a853", text: "#a07f2d", soft: "rgba(212,168,83,0.18)" },
  activity:      { bg: "#5a7a5a", text: "#5a7a5a", soft: "rgba(90,122,90,0.14)"  },
};

export const TYPE_LABELS: Record<string, string> = {
  food:          "Ẩm thực",
  attraction:    "Tham quan",
  transport:     "Di chuyển",
  accommodation: "Lưu trú",
  activity:      "Hoạt động",
};

// ── Day palette ───────────────────────────────────────────────────────────────

const DAY_COLORS = ["#3d5a3d", "#c4785a", "#d4a853", "#5a7a5a", "#8b8378", "#1a1a1a"];
export const dayColor = (day: number) => DAY_COLORS[(day - 1) % DAY_COLORS.length];

// ── Activity templates (pool) ─────────────────────────────────────────────────

export const ACTIVITY_TEMPLATES: (Omit<Activity, "id" | "day"> & { image?: string })[] = [
  {
    time: "09:00", title: "Tham quan địa điểm", titleEn: "Sightseeing",
    description: "Khám phá điểm tham quan nổi tiếng", descriptionEn: "Explore popular attractions",
    type: "attraction", location: "Điểm tham quan", duration: 120, cost: 100_000,
  },
  {
    time: "12:00", title: "Ăn trưa", titleEn: "Lunch",
    description: "Thưởng thức ẩm thực địa phương", descriptionEn: "Enjoy local cuisine",
    type: "food", location: "Nhà hàng", duration: 60, cost: 150_000,
  },
  {
    time: "14:00", title: "Di chuyển", titleEn: "Transport",
    description: "Di chuyển đến điểm tiếp theo", descriptionEn: "Travel to next destination",
    type: "transport", location: "Phương tiện", duration: 30, cost: 50_000,
  },
  {
    time: "19:00", title: "Ăn tối", titleEn: "Dinner",
    description: "Bữa tối đặc sản", descriptionEn: "Special dinner",
    type: "food", location: "Nhà hàng", duration: 90, cost: 200_000,
  },
  {
    time: "21:00", title: "Nghỉ ngơi", titleEn: "Accommodation",
    description: "Check-in khách sạn", descriptionEn: "Hotel check-in",
    type: "accommodation", location: "Khách sạn", duration: 480, cost: 500_000,
  },
  {
    time: "15:00", title: "Hoạt động trải nghiệm", titleEn: "Experience",
    description: "Tham gia hoạt động đặc biệt", descriptionEn: "Join special activity",
    type: "activity", location: "Địa điểm", duration: 120, cost: 300_000,
  },
];

// ── Category mappers ──────────────────────────────────────────────────────────

const API_CATEGORY: Record<Activity["type"], string> = {
  food: "FOOD", attraction: "ATTRACTION", transport: "TRANSPORT",
  accommodation: "STAY", activity: "ACTIVITY",
};

export const activityTypeToCategory = (type: Activity["type"]) =>
  API_CATEGORY[type] ?? "ACTIVITY";
