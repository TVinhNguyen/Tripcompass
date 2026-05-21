"use client"

// _hooks/use-ai-chat.ts — Owns the entire AI chat data flow:
//   • session list + load history + delete
//   • message stream (SSE via streamChat) + abort on unmount/replace
//   • derived flags (streaming, toolRunning)
//
// Extracted from page.tsx so the page stays presentational. SSE handlers are
// inline (no further extraction) because they share five pieces of mutable
// state that would otherwise become awkward setter callbacks.

import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api"
import { streamChat } from "@/lib/stream-chat"
import { getToolLabel } from "@/lib/tool-labels"
import type { GenerateResponse, SessionInfo } from "@/lib/types"

// UI-enriched message; superset of the wire shape.
export interface UiMessage {
  id: string
  role: "user" | "assistant"
  content: string
  toolCalls?: string[]
  plan?: GenerateResponse | null
  createdAt: Date
  streaming?: boolean
  error?: boolean
}

interface HistoryMessage {
  role: "user" | "assistant"
  content: string
  tool_calls?: string[]
  plan?: GenerateResponse | null
  created_at: string
}

export function useAiChat(initialInput = "") {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState(initialInput)
  const [streaming, setStreaming] = useState(false)
  const [toolRunning, setToolRunning] = useState<string | null>(null)

  // Cancel any in-flight stream on unmount — without this, navigating away
  // mid-stream lets SSE keep arriving and setState fires after unmount.
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  // ---- Fetch sessions on mount ----
  useEffect(() => {
    apiFetch<SessionInfo[]>("/ai-chat/sessions")
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => { /* sidebar shows empty state */ })
  }, [])

  // ---- Load history for a session ----
  const loadSession = useCallback(async (sid: string) => {
    try {
      const { messages: hist } = await apiFetch<{
        messages: HistoryMessage[]
        session_id: string
      }>(`/ai-chat/sessions/${sid}/history`)
      setSessionId(sid)
      setMessages(
        (hist || []).map((m, i) => ({
          id: `hist-${i}`,
          role: m.role,
          content: m.content,
          toolCalls: m.tool_calls,
          plan: m.plan,
          createdAt: new Date(m.created_at),
        })),
      )
    } catch {
      toast.error("Không thể tải lịch sử trò chuyện")
    }
  }, [])

  // ---- Delete session ----
  const deleteSession = useCallback(async (sid: string) => {
    setSessions((prev) => prev.filter((s) => s.session_id !== sid))
    setSessionId((cur) => {
      if (cur === sid) setMessages([])
      return cur === sid ? null : cur
    })
    try {
      await apiFetch(`/ai-chat/sessions/${sid}`, { method: "DELETE" })
    } catch {
      toast.error("Không thể xoá phiên trò chuyện")
    }
  }, [])

  // ---- New chat ----
  const startNewChat = useCallback(() => {
    // Abort the in-flight SSE. The aborted fetch does NOT trigger any of the
    // streamChat callbacks (onDone/onError), so we must also clear the
    // streaming + toolRunning flags here — otherwise the input stays in
    // "Stop" mode forever even though no stream is running.
    abortRef.current?.abort()
    setSessionId(null)
    setMessages([])
    setStreaming(false)
    setToolRunning(null)
  }, [])

  // ---- Stop current stream (manual abort from UI) ----
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
    setToolRunning(null)
  }, [])

  // ---- Send message ----
  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim()
      if (!content || streaming) return
      setInput("")

      abortRef.current?.abort()
      abortRef.current = new AbortController()

      const userMsgId = `u-${Date.now()}`
      const aiMsgId = `a-${Date.now()}`

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content, createdAt: new Date() },
        { id: aiMsgId, role: "assistant", content: "", streaming: true, createdAt: new Date() },
      ])
      setStreaming(true)
      setToolRunning(null)

      await streamChat(sessionId, content, {
        signal: abortRef.current.signal,

        onToolStart(tool, label) {
          setToolRunning(label ?? getToolLabel(tool).vi)
        },

        onThinking() {
          // Heartbeat while LLM is silent (often inside a <think> block).
          setToolRunning((prev) => prev ?? "AI đang suy nghĩ...")
        },

        onToken(token) {
          // flushSync defeats React 18 auto-batching so each token paints on
          // its own frame; otherwise tokens arriving in the same network read
          // get coalesced into one render and streaming looks chunky.
          flushSync(() => {
            setMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, content: m.content + token } : m)),
            )
          })
          setToolRunning((prev) => (prev === "AI đang suy nghĩ..." ? null : prev))
        },

        onDone(newSessionId, fullText, plan, toolCalls) {
          const displayText =
            fullText.trim() ||
            (plan
              ? "Mình đã tạo được lịch trình nháp. Bạn có thể xem nhanh bên dưới và lưu lại để chỉnh sửa chi tiết."
              : fullText)

          // Persist session ID from first response + push to sidebar.
          setSessionId((prev) => {
            const sid = newSessionId ?? prev
            if (newSessionId && newSessionId !== prev) {
              setSessions((s) => [
                { session_id: newSessionId, message_count: 2, destination: undefined },
                ...s.filter((x) => x.session_id !== newSessionId),
              ])
            }
            return sid
          })

          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? m.error && !displayText && !plan
                  ? { ...m, streaming: false }
                  : {
                      ...m,
                      content:
                        displayText ||
                        "AI đã kết thúc phản hồi nhưng không trả về nội dung. Vui lòng thử lại.",
                      plan: plan ?? null,
                      toolCalls: toolCalls ?? [],
                      streaming: false,
                      error: m.error && !plan,
                    }
                : m,
            ),
          )
          setStreaming(false)
          setToolRunning(null)
        },

        onError(msg) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, content: msg, error: true, streaming: false }
                : m,
            ),
          )
          setStreaming(false)
          setToolRunning(null)
        },
      })
    },
    [input, sessionId, streaming],
  )

  return {
    // state
    sessions,
    sessionId,
    messages,
    input,
    streaming,
    toolRunning,
    // setters
    setInput,
    // actions
    loadSession,
    deleteSession,
    startNewChat,
    sendMessage,
    stopStreaming,
  }
}
