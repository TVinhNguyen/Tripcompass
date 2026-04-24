"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Activity } from "../_lib/types";
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
  onHoverActivity,
  activeMapId,
}: {
  day: number;
  activities: Activity[];
  onRemoveActivity: (id: string) => void;
  onEditActivity: (a: Activity) => void;
  onHoverActivity?: (id: string | null) => void;
  activeMapId?: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}` });
  // Filter out empty-day sentinel placeholders from visible render
  const realActivities = activities.filter((a) => !a.id.startsWith("__empty-day-"));
  const dayCost  = realActivities.reduce((s, a) => s + (a.cost || 0), 0);
  const color    = dayColor(day);

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
            {dayCost.toLocaleString("vi-VN")} ₫
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
              onRemove={() => onRemoveActivity(activity.id)}
              onEdit={() => onEditActivity(activity)}
              onHover={onHoverActivity}
              isActive={activeMapId === activity.id}
            />
          ))}
        </SortableContext>

        {realActivities.length === 0 && (
          <div className="h-full min-h-[140px] flex items-center justify-center text-center py-8">
            <div>
              <div className="w-10 h-10 mx-auto mb-2 rounded-md border border-dashed border-[#d4cfc5] flex items-center justify-center">
                <Plus className="w-4 h-4 text-[#b8b1a6]" />
              </div>
              <p className="text-[11px] text-[#8b8378] font-mono tracking-wider uppercase">
                Kéo thả
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
