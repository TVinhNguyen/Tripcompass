// =============================================================================
// TripCompass — useUserNotifications — per-user realtime channel
//
// Opens a WebSocket on /ws/user (no itinerary param) so the logged-in user
// receives notifications even when they're not inside an itinerary editor.
// Used for collaborator.invited toasts, role-change pings, etc.
//
// Mount once near the root of the authenticated app tree. The hook handles
// reconnect with jittered backoff just like useItineraryWS.
// =============================================================================

"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import type { WSEvent } from "@/lib/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL!;

type Options = {
  /** Called on every event so callers can update sidebar counters etc. */
  onEvent?: (e: WSEvent) => void;
};

export function useUserNotifications(opts: Options = {}) {
  const { token } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const onEventRef = useRef(opts.onEvent);
  useEffect(() => { onEventRef.current = opts.onEvent; }, [opts.onEvent]);

  const handle = useCallback((evt: WSEvent) => {
    onEventRef.current?.(evt);
    if (evt.type === "collaborator.invited") {
      const dest = evt.payload.itinerary_name ?? "một chuyến đi";
      const who = evt.payload.inviter_name ?? "Có người";
      toast.success(`${who} mời bạn vào "${dest}"`, {
        description: "Mở mục Lời mời để xem chi tiết.",
      });
    } else if (evt.type === "collaborator.accepted") {
      toast.info("Lời mời đã được chấp nhận.");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const connect = () => {
      const ws = new WebSocket(`${WS_URL}/user`, ["bearer", token]);
      wsRef.current = ws;

      ws.onopen = () => { retryRef.current = 0; };

      ws.onmessage = (m) => {
        try {
          handle(JSON.parse(m.data as string) as WSEvent);
        } catch { /* malformed — ignore */ }
      };

      ws.onerror = () => ws.close();

      ws.onclose = () => {
        wsRef.current = null;
        if (cancelled) return;
        // Jittered exponential backoff, capped at 30s.
        const base = Math.min(30_000, 1_000 * 2 ** retryRef.current);
        const delay = Math.round(base * (0.8 + Math.random() * 0.4));
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token, handle]);
}
