// =============================================================================
// TripCompass — useItineraryWS — WebSocket realtime hook
// Source of truth: docs/integration/06-FRONTEND-INFRA.md §4
//                  docs/integration/04-ITINERARY-COLLAB-FLOW.md §5
// =============================================================================

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { WSEvent } from "@/lib/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL!; // ws://localhost:8080/api/v1/ws

type UseItineraryWSReturn = {
  /** Publish a message to the room (optimistic broadcast to peers) */
  send: (msg: object) => void;
};

/**
 * Opens a WebSocket connection to the itinerary collaboration room and
 * dispatches realtime events to `onEvent`.
 *
 * Behaviour:
 * - Connects when both `itineraryId` and `token` are available.
 * - Disconnects on unmount.
 * - Auto-reconnects on close with exponential backoff (1s → 2s → 4s → … max 30s).
 * - On reconnect, caller should re-fetch `GET /itineraries/:id` to sync any
 *   missed state (pass `onReconnect` callback).
 *
 * Protocol reference: 04-ITINERARY-COLLAB-FLOW.md §5
 */
export function useItineraryWS(
  itineraryId: string,
  onEvent: (e: WSEvent) => void,
  onReconnect?: () => void,
): UseItineraryWSReturn {
  const { token } = useAuth();
  const wsRef     = useRef<WebSocket | null>(null);
  const retryRef  = useRef(0);
  // Stable ref so the reconnect closure always sees the latest callback
  const onEventRef      = useRef(onEvent);
  const onReconnectRef  = useRef(onReconnect);
  useEffect(() => { onEventRef.current = onEvent; },      [onEvent]);
  useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!token || !itineraryId) return;

    let cancelled = false;

    const connect = () => {
      const url = `${WS_URL}/itinerary/${itineraryId}?token=${encodeURIComponent(token)}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        // If this is a reconnect (not the first open), sync state
        if (retryRef.current > 0) onReconnectRef.current?.();
      };

      ws.onmessage = (m) => {
        try {
          const evt = JSON.parse(m.data as string) as WSEvent;
          onEventRef.current(evt);
        } catch {
          /* malformed — ignore */
        }
      };

      ws.onerror = () => ws.close();

      ws.onclose = () => {
        wsRef.current = null;
        if (cancelled) return;
        // Reconnect with exponential backoff — max 30s
        const delay = Math.min(30_000, 1_000 * 2 ** retryRef.current);
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
  }, [itineraryId, token]);

  return { send };
}
