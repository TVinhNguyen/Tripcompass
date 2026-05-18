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
 * - Connects when both `itineraryId` and a logged-in `user` are available.
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
  // Auth rides on the HttpOnly cookie sent on the WS upgrade — the browser
  // attaches it automatically. We only need to know whether there's a logged-in
  // user so we don't try to connect anonymously.
  const { user } = useAuth();
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
    if (!user || !itineraryId) return;

    let cancelled = false;

    const connect = () => {
      // Token rides on Sec-WebSocket-Protocol so it does not land in URLs or
      // reverse-proxy access logs.
      const url = `${WS_URL}/itinerary/${itineraryId}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        const wasReconnect = retryRef.current > 0; // capture before reset
        retryRef.current = 0;
        if (wasReconnect) onReconnectRef.current?.(); // Bug 5: now fires correctly
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
        // Exponential backoff with ±20% jitter so a server restart doesn't
        // produce a thundering herd of simultaneous reconnects. Max 30s.
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
  }, [itineraryId, user]);

  return { send };
}
