"use client";

// =============================================================================
// TripCompass — PresenceStack component
// Source of truth: docs/frontend-review-2026-05-01.md §FE-17
//
// Renders an avatar stack showing collaborators currently online in an itinerary.
// Receives presence updates from useItineraryWS (presence.join / presence.leave).
// =============================================================================

import { cn } from "@/lib/utils";

export type PresenceUser = {
  user_id: string;
  full_name?: string;
};

interface PresenceStackProps {
  users: PresenceUser[];
  /** Max avatars to show before +N overflow. Default: 4 */
  maxVisible?: number;
  className?: string;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic color from user_id
const COLORS = [
  { bg: "#3d5a3d", text: "#f5f0e8" },
  { bg: "#c4785a", text: "#f5f0e8" },
  { bg: "#d4a853", text: "#1a1a1a" },
  { bg: "#5a7a9a", text: "#f5f0e8" },
  { bg: "#8b5a8b", text: "#f5f0e8" },
];

function colorFor(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function PresenceStack({ users, maxVisible = 4, className }: PresenceStackProps) {
  if (users.length === 0) return null;

  const visible = users.slice(0, maxVisible);
  const overflow = users.length - maxVisible;

  return (
    <div className={cn("flex items-center", className)} title={`${users.length} người đang xem`}>
      {visible.map((u, i) => {
        const color = colorFor(u.user_id);
        return (
          <div
            key={u.user_id}
            title={u.full_name ?? u.user_id}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 border-[#1a1a1a] -ml-1.5 first:ml-0 transition-transform hover:scale-110 hover:z-10 relative"
            style={{ background: color.bg, color: color.text, zIndex: i }}
          >
            {getInitials(u.full_name)}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className="w-7 h-7 rounded-full bg-white/20 text-[#f5f0e8] text-[10px] font-semibold flex items-center justify-center border-2 border-[#1a1a1a] -ml-1.5"
          title={`+${overflow} người khác`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
