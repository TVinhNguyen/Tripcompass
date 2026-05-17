"use client";

// =============================================================================
// TripCompass — PlanPreviewCard component
// Source of truth: docs/frontend-review-2026-05-01.md §FE-23
//
// Renders AI-generated plan summary inside a chat bubble.
// Includes a "Lưu thành lịch trình" button that opens a title dialog,
// then calls savePlanAsItinerary and redirects to the edit page.
// =============================================================================

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, MapPin, Calendar, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { savePlanAsItinerary } from "@/lib/plan-to-itinerary";
import { toast } from "sonner";
import type { GenerateResponse } from "@/lib/types";

const slotLabels: Record<string, string> = {
  breakfast: "Ăn sáng",
  lunch: "Ăn trưa",
  dinner: "Ăn tối",
  morning_activity: "Sáng",
  afternoon_activity: "Chiều",
  evening_activity: "Tối",
  full_day_activity: "Cả ngày",
};

function slotSummary(slot: GenerateResponse["days"][number]["slots"][number]) {
  const label = slotLabels[slot.slot_type] ?? "";
  const name = slot.place?.name ?? "";
  const notes = typeof slot.notes === "string" ? slot.notes.trim() : "";
  const text = name && notes ? `${name} (${notes})` : name || notes;

  if (!text) return "";
  return label ? `${label}: ${text}` : text;
}

function slotTitle(slot: GenerateResponse["days"][number]["slots"][number]) {
  return slot.place?.name ?? slot.notes ?? slotLabels[slot.slot_type] ?? "Hoạt động";
}

interface PlanPreviewCardProps {
  plan: GenerateResponse;
  /** Called after a successful save (optional — for parent state updates) */
  onSaved?: (itineraryId: string) => void;
}

export function PlanPreviewCard({ plan, onSaved }: PlanPreviewCardProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const totalDays = plan.days?.length ?? 0;
  const dest = plan.days?.[0]?.primary_area ?? "Việt Nam";
  const spent =
    (plan.budget_recap?.attraction_spent_vnd ?? 0) +
    (plan.budget_recap?.food_spent_vnd ?? 0);
  const budget = Math.max(
    plan.budget_recap?.total_budget_vnd ?? 0,
    spent + Math.max(plan.budget_recap?.remaining_vnd ?? 0, 0),
    spent,
  );
  const violations = plan.violations?.filter((v) => v.severity === "error") ?? [];

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const today = new Date();
      const end = new Date(today);
      end.setDate(today.getDate() + totalDays - 1);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const it = await savePlanAsItinerary(plan, {
        title: title.trim(),
        destination: dest,
        start_date: fmt(today),
        end_date: fmt(end),
        budget_vnd: budget,
        guest_count: 2,
        tags: [],
      });
      toast.success("Đã lưu lịch trình!");
      onSaved?.(it.id);
      router.push(`/itinerary/${it.id}/edit`);
    } catch (error) {
      console.error("Save itinerary failed", error);
      toast.error(error instanceof ApiError ? error.message : "Lưu lịch trình thất bại. Thử lại sau.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mt-3 bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] rounded-2xl overflow-hidden max-w-md w-full">
        {/* Cover image */}
        <div className="relative h-36">
          <Image
            src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800"
            alt={dest}
            fill
            className="object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] to-transparent" />
          <div className="absolute bottom-3 left-4 right-4">
            <div className="text-[#d4a853] text-xs uppercase tracking-wider mb-1">Lịch trình gợi ý</div>
            <div className="text-lg font-semibold text-white tracking-tight">{dest}</div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 text-white">
            <div>
              <div className="flex items-center gap-1 text-white/60 text-xs mb-1">
                <MapPin className="w-3 h-3" /> Điểm đến
              </div>
              <div className="text-sm font-medium truncate">{dest}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-white/60 text-xs mb-1">
                <Calendar className="w-3 h-3" /> Thời gian
              </div>
              <div className="text-sm font-medium">{totalDays} ngày</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-white/60 text-xs mb-1">
                <Wallet className="w-3 h-3" /> Ngân sách
              </div>
              <div className="text-sm font-medium">{(budget / 1_000_000).toFixed(1)}M ₫</div>
            </div>
          </div>

          {/* Days summary */}
          {plan.days && plan.days.length > 0 && (
            <div>
              <div className="text-white/60 text-xs mb-2">Tóm tắt theo ngày</div>
              <ul className="space-y-1">
                {plan.days.slice(0, 3).map((day) => (
                  <li key={day.day_num} className="flex items-start gap-2 text-sm text-white/90">
                    <div className="w-5 h-5 rounded-full bg-[#d4a853]/20 text-[#d4a853] text-xs flex items-center justify-center shrink-0">
                      {day.day_num}
                    </div>
                    <span className="truncate">
                      {day.slots
                        .map(slotSummary)
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
                {plan.days.length > 3 && (
                  <li className="text-xs text-white/40">+{plan.days.length - 3} ngày nữa...</li>
                )}
              </ul>

              <button
                type="button"
                onClick={() => setTimelineOpen((open) => !open)}
                className="mt-3 flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/5"
                aria-expanded={timelineOpen}
              >
                <span>Chi tiết lịch trình</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${timelineOpen ? "rotate-180" : ""}`} />
              </button>

              {timelineOpen && (
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
                  {plan.days.map((day) => (
                    <div key={day.day_num} className="space-y-2">
                      <div className="text-xs font-medium text-[#d4a853]">
                        Ngày {day.day_num}
                        {day.date_str ? ` · ${day.date_str}` : ""}
                      </div>
                      <ol className="space-y-2">
                        {day.slots.map((slot, index) => {
                          const label = slotLabels[slot.slot_type] ?? slot.slot_type;
                          const time = slot.start && slot.end ? `${slot.start}-${slot.end}` : "";
                          const notes = typeof slot.notes === "string" ? slot.notes.trim() : "";

                          return (
                            <li key={`${day.day_num}-${slot.start}-${slot.end}-${index}`} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
                              <span className="font-medium text-white/45">{time}</span>
                              <span className="min-w-0">
                                <span className="block text-white/55">{label}</span>
                                <span className="block truncate text-white/90">{slotTitle(slot)}</span>
                                {notes && <span className="block text-white/55">{notes}</span>}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Violations */}
          {violations.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs text-red-300 space-y-1">
              {violations.map((v, i) => (
                <div key={i}>⚠ {v.message}</div>
              ))}
            </div>
          )}

          {/* Budget warning */}
          {plan.budget_warning && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-xs text-yellow-300">
              {plan.budget_warning}
            </div>
          )}

          {/* Action */}
          <Button
            onClick={() => { setTitle(`Lịch trình ${dest}`); setDialogOpen(true); }}
            className="w-full bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] h-10"
          >
            Lưu thành lịch trình
          </Button>
        </div>
      </div>

      {/* Save dialog — simple modal (no extra deps) */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !saving && setDialogOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <button
              onClick={() => !saving && setDialogOpen(false)}
              className="absolute top-4 right-4 text-[#8b8378] hover:text-[#1a1a1a]"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-serif text-xl font-semibold text-[#1a1a1a] mb-1">
              Đặt tên lịch trình
            </h2>
            <p className="text-sm text-[#6b6b6b] mb-4">
              Lịch trình sẽ được lưu và bạn có thể chỉnh sửa sau.
            </p>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="VD: Khám phá Đà Nẵng 3 ngày"
              className="w-full px-4 py-3 border border-[#e8e2d9] rounded-lg text-[#1a1a1a] placeholder-[#8b8378] focus:outline-none focus:border-[#3d5a3d] focus:ring-2 focus:ring-[#3d5a3d]/10 mb-4"
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                className="flex-1"
              >
                Huỷ
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="flex-1 bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Lưu"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
