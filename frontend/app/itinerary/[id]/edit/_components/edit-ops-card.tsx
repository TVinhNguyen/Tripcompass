"use client";

import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { EditOp } from "@/lib/types";

const CATEGORY_LABELS: Record<string, string> = {
  FOOD: "Ẩm thực",
  ATTRACTION: "Tham quan",
  TRANSPORT: "Di chuyển",
  STAY: "Lưu trú",
  ACTIVITY: "Hoạt động",
};

function opLabel(op: EditOp, resolveLabel?: (id: string) => string): { icon: React.ReactNode; text: string; meta: string } {
  if (op.op === "add") {
    const bits = [`Ngày ${op.day_number}`];
    if (op.start_time) bits.push(op.start_time);
    if (op.category && CATEGORY_LABELS[op.category]) bits.push(CATEGORY_LABELS[op.category]);
    return {
      icon: <Plus className="w-3.5 h-3.5 text-[#3d5a3d]" />,
      text: `Thêm “${op.title}”`,
      meta: bits.join(" · "),
    };
  }
  if (op.op === "delete") {
    const name = resolveLabel?.(op.activity_id);
    return {
      icon: <Trash2 className="w-3.5 h-3.5 text-[#c4785a]" />,
      text: name ? `Xoá “${name}”` : "Xoá 1 hoạt động",
      meta: "",
    };
  }
  // update
  const name = resolveLabel?.(op.activity_id) ?? "hoạt động";
  const changes: string[] = [];
  if (op.title) changes.push(`tên → “${op.title}”`);
  if (op.start_time) changes.push(`giờ → ${op.start_time}`);
  if (op.day_number) changes.push(`ngày → ${op.day_number}`);
  if (op.category && CATEGORY_LABELS[op.category]) changes.push(`loại → ${CATEGORY_LABELS[op.category]}`);
  if (typeof op.estimated_cost === "number") changes.push("giá");
  if (op.notes) changes.push("mô tả");
  return {
    icon: <Pencil className="w-3.5 h-3.5 text-[#a07f2d]" />,
    text: `Sửa “${name}”`,
    meta: changes.join(", "),
  };
}

export function EditOpsCard({
  ops,
  status,
  busy,
  onApply,
  onDismiss,
  resolveLabel,
}: {
  ops: EditOp[];
  status: "pending" | "applied" | "dismissed";
  busy?: boolean;
  onApply: () => void;
  onDismiss: () => void;
  resolveLabel?: (activityId: string) => string;
}) {
  if (ops.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-[#d4a853]/40 bg-[#fffdf7] overflow-hidden">
      <div className="px-3 py-2 border-b border-[#efe7d4] flex items-center gap-2">
        <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-[#a07f2d]">
          Đề xuất chỉnh sửa
        </span>
        <span className="text-[11px] text-[#8b8378]">{ops.length} thay đổi</span>
      </div>

      <ul className="px-3 py-2 space-y-1.5">
        {ops.map((op, i) => {
          const { icon, text, meta } = opLabel(op, resolveLabel);
          return (
            <li key={i} className="flex items-start gap-2 text-[13px] text-[#1a1a1a]">
              <span className="mt-0.5 shrink-0">{icon}</span>
              <span className="min-w-0">
                <span className="break-words [overflow-wrap:anywhere]">{text}</span>
                {meta && <span className="text-[#8b8378]"> — {meta}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {status === "pending" ? (
        <div className="px-3 py-2 border-t border-[#efe7d4] flex items-center gap-2">
          <button
            onClick={onApply}
            disabled={busy}
            className="h-8 px-3 rounded-md bg-[#3d5a3d] hover:bg-[#324a32] text-[#f5f0e8] text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Áp dụng
          </button>
          <button
            onClick={onDismiss}
            disabled={busy}
            className="h-8 px-3 rounded-md border border-[#e0d9cc] hover:bg-white text-[#6b6b6b] text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-60"
          >
            <X className="w-3.5 h-3.5" />
            Bỏ qua
          </button>
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-[#efe7d4] text-[11px] text-[#8b8378] flex items-center gap-1.5">
          {status === "applied" ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#3d5a3d]" /> Đã áp dụng vào lịch trình
            </>
          ) : (
            <>
              <X className="w-3.5 h-3.5" /> Đã bỏ qua
            </>
          )}
        </div>
      )}
    </div>
  );
}
