"use client";

import { useState } from "react";
import Image from "next/image";
import { Crown, Pencil, Eye, Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Collaborator } from "../_lib/types";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner:  <Crown  className="w-3 h-3 text-[#d4a853]" />,
  editor: <Pencil className="w-3 h-3 text-[#3d5a3d]" />,
  viewer: <Eye    className="w-3 h-3 text-[#8b8378]" />,
};

const ROLE_LABELS: Record<string, string> = {
  owner:  "Chủ sở hữu",
  editor: "Có thể chỉnh sửa",
  viewer: "Chỉ xem",
};

export function CollaboratorsPanel({ collaborators }: { collaborators: Collaborator[] }) {
  const [copied, setCopied] = useState(false);
  const shareLink = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}?invite=share`
    : "";

  const copy = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const online = collaborators.filter((c) => c.isOnline);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 h-9 px-2.5 rounded-md hover:bg-[#eeeae1] transition-colors">
          <div className="flex -space-x-2">
            {online.slice(0, 3).map((c) => (
              c.avatar
                ? (
                  <div key={c.id} className="relative w-6 h-6 rounded-full border-2 border-[#fbf8f2] overflow-hidden">
                    <Image src={c.avatar} alt={c.name} fill className="object-cover" />
                  </div>
                )
                : (
                  <div
                    key={c.id}
                    className="w-6 h-6 rounded-full border-2 border-[#fbf8f2] bg-[#3d5a3d] flex items-center justify-center text-[10px] font-bold text-white"
                  >
                    {c.name[0]}
                  </div>
                )
            ))}
          </div>
          <span className="text-xs text-[#6b6b6b] hidden sm:inline nums">
            {online.length} online
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 bg-white border-[#e0d9cc] p-0 shadow-xl">
        <div className="p-4 border-b border-[#e8e2d9]">
          <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-[#8b8378]">Collaborators</div>
          <h3 className="font-semibold text-[#1a1a1a] mt-1">{collaborators.length} thành viên</h3>
        </div>

        <div className="p-2 max-h-64 overflow-y-auto">
          {collaborators.length === 0 && (
            <p className="text-center text-xs text-[#8b8378] py-4">Chưa có ai online</p>
          )}
          {collaborators.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-[#f5f0e8]">
              <div className="relative">
                {c.avatar
                  ? <Image src={c.avatar} alt={c.name} width={32} height={32} className="rounded-full w-8 h-8 object-cover" />
                  : (
                    <div className="w-8 h-8 rounded-full bg-[#3d5a3d] flex items-center justify-center text-sm font-bold text-white">
                      {c.name[0]}
                    </div>
                  )
                }
                {c.isOnline && (
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-[#3d5a3d] rounded-full border-2 border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a1a] truncate">{c.name}</p>
                <div className="flex items-center gap-1 text-xs text-[#8b8378]">
                  {ROLE_ICONS[c.role]}
                  <span>{ROLE_LABELS[c.role]}</span>
                </div>
              </div>
              {!c.isOnline && <span className="text-[10px] text-[#b8b1a6] nums">OFFLINE</span>}
            </div>
          ))}
        </div>

        {shareLink && (
          <div className="p-3 border-t border-[#e8e2d9] bg-[#f5f0e8]">
            <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-[#8b8378]">Share link</div>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-md border border-[#e0d9cc]">
                <Link2 className="w-3.5 h-3.5 text-[#8b8378] shrink-0" />
                <span className="text-[11px] text-[#6b6b6b] truncate font-mono">{shareLink}</span>
              </div>
              <Button size="sm" onClick={copy} className="bg-[#1a1a1a] hover:bg-black text-[#f5f0e8] shrink-0 h-8">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
