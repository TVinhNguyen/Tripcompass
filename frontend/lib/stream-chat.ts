// =============================================================================
// TripCompass — SSE Chat Stream helper
// Source of truth: docs/integration/06-FRONTEND-INFRA.md §5
// =============================================================================

import type { GenerateResponse } from "./types";

const AI_URL = process.env.NEXT_PUBLIC_PLANNER_AI_URL!;

// ---------------------------------------------------------------------------
// Handler interface
// ---------------------------------------------------------------------------

export type StreamHandlers = {
  /** Called when AI starts calling a tool */
  onToolStart?: (tool: string, label?: string) => void;
  /** Called for each streaming text token */
  onToken?: (text: string) => void;
  /** Called when the stream completes */
  onDone: (
    sessionId: string,
    fullText: string,
    plan?: GenerateResponse | null,
    toolCalls?: string[],
  ) => void;
  /** Called on stream-level or parse error */
  onError?: (msg: string) => void;
  /** AbortSignal to cancel mid-stream (e.g. when user sends new message) */
  signal?: AbortSignal;
};

// ---------------------------------------------------------------------------
// Raw SSE event shapes from server
// ---------------------------------------------------------------------------

type SseEvent =
  | { type: "tool_start"; tool: string; label?: string }
  | { type: "token"; content: string }
  | {
      type: "done";
      session_id: string;
      full_text?: string;
      plan?: GenerateResponse | null;
      tool_calls?: string[];
    }
  | { type: "error"; message?: string };

// ---------------------------------------------------------------------------
// streamChat — main export
// ---------------------------------------------------------------------------

/**
 * Open an SSE connection to planner-ai `/chat/stream` and dispatch events
 * to the provided handlers.
 *
 * ```ts
 * const ctrl = new AbortController();
 * await streamChat(sessionId, message, {
 *   onToken: (t) => setBuffer((b) => b + t),
 *   onDone: (sid, text, plan) => handleDone(sid, text, plan),
 *   signal: ctrl.signal,
 * });
 * ```
 */
export async function streamChat(
  sessionId: string | null,
  message: string,
  handlers: StreamHandlers,
): Promise<void> {
  const { onToolStart, onToken, onDone, onError, signal } = handlers;

  let res: Response;
  try {
    res = await fetch(`${AI_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId ?? undefined,
        message,
      }),
      signal,
    });
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") return;
    onError?.("Không thể kết nối đến AI. Vui lòng thử lại.");
    return;
  }

  if (!res.ok || !res.body) {
    if (res.status === 429) {
      onError?.("Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau 60 giây.");
    } else {
      onError?.(`Lỗi kết nối AI (${res.status}). Vui lòng thử lại.`);
    }
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // Split on double-newline (SSE event boundary)
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        if (!chunk.startsWith("data: ")) continue;

        let evt: SseEvent;
        try {
          evt = JSON.parse(chunk.slice(6)) as SseEvent;
        } catch {
          continue; // malformed line — skip
        }

        switch (evt.type) {
          case "tool_start":
            onToolStart?.(evt.tool, evt.label);
            break;
          case "token":
            onToken?.(evt.content ?? "");
            break;
          case "done":
            onDone(
              evt.session_id,
              evt.full_text ?? "",
              evt.plan,
              evt.tool_calls,
            );
            break;
          case "error":
            onError?.(evt.message ?? "Lỗi không xác định từ AI.");
            break;
        }
      }
    }
  } catch (err: unknown) {
    if ((err as Error).name !== "AbortError") {
      onError?.("Mất kết nối với AI. Đang thử lại...");
    }
  } finally {
    reader.releaseLock();
  }
}
