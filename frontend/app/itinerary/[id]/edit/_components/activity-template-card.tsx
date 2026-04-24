"use client";

import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Activity } from "../_lib/types";
import { TYPE_COLOR, TYPE_ICONS } from "../_lib/constants";

export function ActivityTemplateCard({
  template,
  index,
}: {
  template: Omit<Activity, "id" | "day"> & { image?: string };
  index: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `template-${index}`,
    data: { template, isTemplate: true },
  });
  const color = TYPE_COLOR[template.type];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "px-3 py-2.5 bg-white rounded-md border border-[#e8e2d9] cursor-grab active:cursor-grabbing transition",
        isDragging ? "opacity-50 shadow-xl" : "hover:border-[#d4cfc5] hover:shadow-sm"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ background: color.soft, color: color.text }}
        >
          {TYPE_ICONS[template.type]}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-[#1a1a1a] truncate">{template.title}</h4>
          <div className="flex items-center gap-2 text-[11px] text-[#8b8378] mt-0.5">
            <span className="nums font-mono">{template.duration}m</span>
            {template.cost > 0 && (
              <>
                <span className="text-[#d4cfc5]">·</span>
                <span className="nums font-mono">~{template.cost.toLocaleString("vi-VN")} ₫</span>
              </>
            )}
          </div>
        </div>
        <GripVertical className="w-3.5 h-3.5 text-[#b8b1a6]" />
      </div>
    </div>
  );
}
