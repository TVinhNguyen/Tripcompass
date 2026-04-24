"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Activity } from "../_lib/types";
import { TYPE_ICONS, TYPE_COLOR, TYPE_LABELS } from "../_lib/constants";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-[#8b8378]">
      {children}
    </div>
  );
}

export function ActivityEditModal({
  activity,
  isOpen,
  onClose,
  onSave,
}: {
  activity: Activity | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (activity: Activity) => void;
}) {
  const [edited, setEdited] = useState<Activity | null>(null);

  useEffect(() => {
    if (activity) setEdited({ ...activity });
  }, [activity]);

  if (!edited) return null;

  const patch = (partial: Partial<Activity>) => setEdited({ ...edited, ...partial });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#fbf8f2] border-[#e0d9cc] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <SectionLabel>Activity · chỉnh sửa</SectionLabel>
          <DialogTitle className="text-[#1a1a1a] text-lg font-semibold mt-1">
            {edited.title || "Hoạt động"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Type */}
          <label className="block">
            <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Loại hoạt động</span>
            <Select
              value={edited.type}
              onValueChange={(v) => patch({ type: v as Activity["type"] })}
            >
              <SelectTrigger className="bg-white border-[#e0d9cc]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-white"
                        style={{ background: TYPE_COLOR[key].bg }}
                      >
                        {TYPE_ICONS[key]}
                      </span>
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {/* Title */}
          <label className="block">
            <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Tên hoạt động</span>
            <Input
              value={edited.title}
              onChange={(e) => patch({ title: e.target.value })}
              className="bg-white border-[#e0d9cc]"
              placeholder="VD: Tham quan Hồ Gươm"
            />
          </label>

          {/* Time + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Giờ bắt đầu</span>
              <Input
                type="time" value={edited.time}
                onChange={(e) => patch({ time: e.target.value })}
                className="bg-white border-[#e0d9cc] nums"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Thời lượng (phút)</span>
              <Input
                type="number" value={edited.duration}
                onChange={(e) => patch({ duration: parseInt(e.target.value) || 0 })}
                className="bg-white border-[#e0d9cc] nums"
              />
            </label>
          </div>

          {/* Location */}
          <label className="block">
            <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Địa điểm</span>
            <Input
              value={edited.location}
              onChange={(e) => patch({ location: e.target.value })}
              className="bg-white border-[#e0d9cc]"
              placeholder="VD: Phố Cổ Hà Nội"
            />
          </label>

          {/* Lat + Lng */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Vĩ độ (lat)</span>
              <Input
                type="number" step="any" value={edited.lat ?? ""}
                onChange={(e) => patch({ lat: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                className="bg-white border-[#e0d9cc] nums"
                placeholder="21.0285"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Kinh độ (lng)</span>
              <Input
                type="number" step="any" value={edited.lng ?? ""}
                onChange={(e) => patch({ lng: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                className="bg-white border-[#e0d9cc] nums"
                placeholder="105.8542"
              />
            </label>
          </div>

          {/* Cost */}
          <label className="block">
            <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Chi phí (VNĐ)</span>
            <Input
              type="number" value={edited.cost || 0}
              onChange={(e) => patch({ cost: parseInt(e.target.value) || 0 })}
              className="bg-white border-[#e0d9cc] nums"
            />
          </label>

          {/* Notes */}
          <label className="block">
            <span className="block text-xs font-medium text-[#1a1a1a] mb-1.5">Mô tả</span>
            <Textarea
              value={edited.description}
              onChange={(e) => patch({ description: e.target.value })}
              className="bg-white border-[#e0d9cc] min-h-[80px]"
              placeholder="Mô tả chi tiết về hoạt động..."
            />
          </label>
        </div>

        <div className="flex gap-3 justify-end pt-3 border-t border-[#e0d9cc] mt-2">
          <Button variant="outline" onClick={onClose} className="border-[#e0d9cc] text-[#1a1a1a]">
            Hủy
          </Button>
          <Button
            onClick={() => onSave(edited)}
            className="bg-[#1a1a1a] hover:bg-[#000] text-[#f5f0e8]"
          >
            Lưu thay đổi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
