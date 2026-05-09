"use client";

// =============================================================================
// TripCompass — PlacePicker component
// Source of truth: docs/frontend-review-2026-05-01.md §FE-21
//                  docs/integration/03-AI-PLANNER-FLOW.md §3
//
// Drawer/Modal for pre-selecting places before AI generates a plan.
// Each place cycles through 3 states: neutral → include → exclude → neutral.
// "Tạo lịch trình" builds a hint message and passes it to the parent's send handler.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { X, Loader2, MapPin, RefreshCw, Check, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Place } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlaceState = "neutral" | "include" | "exclude";

interface PlaceWithState {
  place: Place;
  state: PlaceState;
}

interface PlacePickerProps {
  destination: string;
  onClose: () => void;
  /** Called with the constructed hint message so the parent can stream it */
  onSend: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cycleState(current: PlaceState): PlaceState {
  if (current === "neutral") return "include";
  if (current === "include") return "exclude";
  return "neutral";
}

function stateStyles(state: PlaceState) {
  switch (state) {
    case "include":
      return {
        border: "border-[#3d5a3d]",
        bg: "bg-[#3d5a3d]/5",
        badge: "bg-[#3d5a3d] text-white",
        icon: <Check className="w-3 h-3" />,
        label: "Bắt buộc có",
      };
    case "exclude":
      return {
        border: "border-red-400",
        bg: "bg-red-50",
        badge: "bg-red-500 text-white",
        icon: <Ban className="w-3 h-3" />,
        label: "Bỏ qua",
      };
    default:
      return {
        border: "border-[#e8e2d9]",
        bg: "bg-white",
        badge: "",
        icon: null,
        label: "",
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlacePicker({ destination, onClose, onSend }: PlacePickerProps) {
  const [places, setPlaces] = useState<PlaceWithState[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    try {
      type PlacesResponse = { data: Place[] } | Place[];
      const res = await apiFetch<PlacesResponse>(
        `/places?destination=${encodeURIComponent(destination)}&category=ATTRACTION&limit=30`,
        { auth: false },
      );
      const list: Place[] = Array.isArray(res) ? res : (res as { data: Place[] }).data ?? [];
      setPlaces(list.map((p) => ({ place: p, state: "neutral" })));
    } catch {
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [destination]);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  const toggle = (id: string) => {
    setPlaces((prev) =>
      prev.map((pw) =>
        pw.place.id === id ? { ...pw, state: cycleState(pw.state) } : pw,
      ),
    );
  };

  const resetAll = () => {
    setPlaces((prev) => prev.map((pw) => ({ ...pw, state: "neutral" })));
  };

  const handleCreate = () => {
    const include = places.filter((pw) => pw.state === "include").map((pw) => pw.place.name);
    const exclude = places.filter((pw) => pw.state === "exclude").map((pw) => pw.place.name);

    let msg = `Tạo cho tôi lịch trình khám phá ${destination}.`;
    if (include.length > 0) msg += ` Phải có: ${include.join(", ")}.`;
    if (exclude.length > 0) msg += ` Tránh: ${exclude.join(", ")}.`;

    onSend(msg);
    onClose();
  };

  const includeCount = places.filter((pw) => pw.state === "include").length;
  const excludeCount = places.filter((pw) => pw.state === "exclude").length;
  const hasSelection = includeCount > 0 || excludeCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e8e2d9] flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-serif text-lg font-semibold text-[#1a1a1a]">
              Chọn địa điểm — {destination}
            </h2>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Chạm để chọn trạng thái: <span className="text-[#3d5a3d] font-medium">✓ Bắt buộc</span>
              {" · "}
              <span className="text-red-500 font-medium">✕ Bỏ qua</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#8b8378] hover:text-[#1a1a1a] rounded-md hover:bg-[#f5f0e8]"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#3d5a3d]" />
            </div>
          ) : places.length === 0 ? (
            <div className="text-center py-16 text-[#6b6b6b] text-sm">
              Không tìm thấy địa điểm nào cho {destination}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {places.map(({ place, state }) => {
                const styles = stateStyles(state);
                return (
                  <button
                    key={place.id}
                    onClick={() => toggle(place.id)}
                    className={cn(
                      "relative text-left rounded-xl border-2 overflow-hidden transition-all",
                      styles.border,
                      styles.bg,
                    )}
                  >
                    {/* Image */}
                    <div className="relative h-24">
                      {place.cover_image ? (
                        <Image
                          src={place.cover_image}
                          alt={place.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#eeeae1] flex items-center justify-center">
                          <MapPin className="w-6 h-6 text-[#8b8378]" />
                        </div>
                      )}
                      {/* State badge */}
                      {state !== "neutral" && (
                        <div
                          className={cn(
                            "absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center",
                            styles.badge,
                          )}
                        >
                          {styles.icon}
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-2.5">
                      <div className="text-sm font-medium text-[#1a1a1a] leading-snug line-clamp-1">
                        {place.name}
                      </div>
                      {place.area && (
                        <div className="text-[11px] text-[#8b8378] mt-0.5 line-clamp-1">
                          {place.area}
                        </div>
                      )}
                      {state !== "neutral" && (
                        <div
                          className={cn(
                            "text-[10px] font-semibold mt-1 uppercase tracking-wide",
                            state === "include" ? "text-[#3d5a3d]" : "text-red-500",
                          )}
                        >
                          {styles.label}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#e8e2d9] flex items-center justify-between gap-3 shrink-0 bg-[#fbf8f2]">
          <div className="text-sm text-[#6b6b6b]">
            {hasSelection
              ? `${includeCount > 0 ? `${includeCount} bắt buộc` : ""}${includeCount > 0 && excludeCount > 0 ? ", " : ""}${excludeCount > 0 ? `${excludeCount} bỏ qua` : ""}`
              : "Chưa chọn gì — AI tự quyết định"}
          </div>
          <div className="flex gap-2">
            {hasSelection && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetAll}
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                AI tự chọn
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleCreate}
              className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white gap-1.5"
            >
              Tạo lịch trình
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
