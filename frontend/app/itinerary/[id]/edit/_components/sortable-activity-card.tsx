"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MapPin, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Activity } from "../_lib/types";
import { TYPE_COLOR, TYPE_LABELS } from "../_lib/constants";

export function SortableActivityCard({
  activity,
  onRemove,
  onEdit,
  onHover,
  isActive,
}: {
  activity: Activity;
  onRemove: () => void;
  onEdit: () => void;
  onHover?: (id: string | null) => void;
  isActive: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  });
  const color = TYPE_COLOR[activity.type];

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderLeftColor: color.bg,
      }}
      className={cn(
        "group relative bg-white rounded-md border border-[#e8e2d9] border-l-[3px] overflow-hidden cursor-pointer transition",
        isDragging ? "opacity-50 shadow-xl" : "hover:shadow-md hover:border-[#d4cfc5]",
        isActive && "ring-2 ring-[#1a1a1a] ring-offset-1 ring-offset-[#fbf8f2]"
      )}
      onClick={onEdit}
      onMouseEnter={() => onHover?.(activity.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start gap-2 mb-1.5">
          <button
            {...attributes} {...listeners}
            className="mt-0.5 text-[#b8b1a6] hover:text-[#1a1a1a] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition"
            onClick={(e) => e.stopPropagation()}
            aria-label="Kéo thả"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          <span className="text-[11px] font-mono tracking-wider nums" style={{ color: color.text }}>
            {activity.time}
          </span>

          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide"
            style={{ background: color.soft, color: color.text }}
          >
            {TYPE_LABELS[activity.type]}
          </span>

          {activity.id.startsWith("ai-") && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-mono tracking-wider text-[#d4a853] uppercase">
              <Sparkles className="w-3 h-3" /> AI
            </span>
          )}
        </div>

        {/* Title */}
        <h4 className="font-semibold text-[#1a1a1a] text-sm leading-snug line-clamp-2">
          {activity.title}
        </h4>

        {/* Location */}
        {activity.location && (
          <div className="flex items-center gap-1 mt-1.5 text-[11px] text-[#6b6b6b]">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{activity.location}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[#efeae0]">
          <div className="flex items-center gap-3 text-[11px]">
            <span className="nums text-[#8b8378] font-mono">{activity.duration}m</span>
            {activity.cost > 0
              ? <span className="nums font-mono font-semibold text-[#1a1a1a]">{activity.cost.toLocaleString("vi-VN")} ₫</span>
              : <span className="text-[#b8b1a6] italic">Miễn phí</span>
            }
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1 text-[#b8b1a6] hover:text-[#c94a4a] hover:bg-[#f5ecec] rounded transition opacity-0 group-hover:opacity-100"
            aria-label="Xóa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
