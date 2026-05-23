"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatVND } from "@/lib/format";
import { isEmptyDaySentinel, type Activity } from "../_lib/types";
import { dayColor } from "../_lib/constants";
import { SortableActivityCard } from "./sortable-activity-card";

function NumLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="text-[10px] font-mono tracking-[0.2em] uppercase nums" style={{ color: color ?? "#8b8378" }}>
      {children}
    </span>
  );
}

export function DroppableDay({
  day,
  activities,
  onRemoveActivity,
  onEditActivity,
  onAddActivity,
  onHoverActivity,
  activeMapId,
}: {
  day: number;
  activities: Activity[];
  onRemoveActivity: (id: string) => void;
  onEditActivity: (a: Activity) => void;
  // Triggered when user clicks the "+ Thêm" button under a day's activity
  // list. Caller opens the edit modal in create-mode with day prefilled.
  onAddActivity: (day: number) => void;
  onHoverActivity?: (id: string | null) => void;
  activeMapId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}` });
  // Filter out empty-day sentinel placeholders from visible render
  const realActivities = activities.filter((a) => !isEmptyDaySentinel(a));
  const dayCost  = realActivities.reduce((s, a) => s + (a.cost || 0), 0);
  const color    = dayColor(day);

  // Map markers number activities-with-coords by time within the day. Mirror
  // that ordering here so each card can show the same number as its marker.
  const mapIndexById = new Map<string, number>();
  [...realActivities]
    .filter((a) => a.lat != null && a.lng != null)
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach((a, i) => mapIndexById.set(a.id, i + 1));

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-[320px] shrink-0 flex flex-col rounded-lg border bg-[#fbf8f2] transition",
        isOver ? "border-[#1a1a1a] bg-[#f5f0e8]" : "border-[#e0d9cc]"
      )}
    >
      {/* Day header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#e8e2d9]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full" style={{ background: color }} aria-hidden />
          <NumLabel color={color}>Day {String(day).padStart(2, "0")}</NumLabel>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[11px] text-[#6b6b6b] nums font-mono">
            {realActivities.length} hoạt động
          </span>
          <span className="text-[11px] font-mono font-semibold nums text-[#1a1a1a]">
            {formatVND(dayCost)}
          </span>
        </div>
      </div>

      {/* Activities */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px]">
        {/* SortableContext includes all (so DnD knows about them), render only real */}
        <SortableContext items={activities.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {realActivities.map((activity) => (
            <SortableActivityCard
              key={activity.id}
              activity={activity}
              mapIndex={mapIndexById.get(activity.id)}
              dayColor={color}
              onRemove={() => onRemoveActivity(activity.id)}
              onEdit={() => onEditActivity(activity)}
              onHover={onHoverActivity}
              isActive={activeMapId === activity.id}
            />
          ))}
        </SortableContext>

        {realActivities.length === 0 && (
          <button
            type="button"
            onClick={() => onAddActivity(day)}
            data-tour={day === 1 ? "editor-add-activity" : undefined}
            className="w-full min-h-[140px] flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[#d4cfc5] text-[#8b8378] transition-colors hover:border-[#3d5a3d] hover:text-[#3d5a3d]"
          >
            <Plus className="w-4 h-4" />
            <span className="text-[11px] font-mono tracking-wider uppercase">Thêm hoạt động</span>
          </button>
        )}

        {/* Inline "+ Thêm" button at the tail of a non-empty day. Primary
            discoverable add path — drag-drop from the template pool is still
            available but no longer the only option. */}
        {realActivities.length > 0 && (
          <button
            type="button"
            onClick={() => onAddActivity(day)}
            data-tour={day === 1 ? "editor-add-activity" : undefined}
            className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 text-xs text-[#6b6b6b] rounded-md border border-dashed border-[#d4cfc5] transition-colors hover:border-[#3d5a3d] hover:text-[#3d5a3d] hover:bg-[#3d5a3d]/5"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm hoạt động
          </button>
        )}
      </div>
    </div>
  );
}
