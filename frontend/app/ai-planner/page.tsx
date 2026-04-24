"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles, Send, Plus, Trash2, Loader2, MessageSquare,
  Compass, MapPin, Calendar, Wallet, Bot, User as UserIcon,
  AlertCircle, RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { RequireAuth } from "@/components/require-auth"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api"
import { streamChat } from "@/lib/stream-chat"
import { savePlanAsItinerary } from "@/lib/plan-to-itinerary"
import { getToolLabel, CHAT_SUGGESTIONS } from "@/lib/tool-labels"
import type { SessionInfo, GenerateResponse } from "@/lib/types"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ---------------------------------------------------------------------------
// Local message type (enriched for UI streaming)
// ---------------------------------------------------------------------------
interface UiMessage {
  id: string
  role: "user" | "assistant"
  content: string          // accumulated text
  toolCalls?: string[]
  plan?: GenerateResponse | null
  createdAt: Date
  streaming?: boolean      // true while SSE tokens arriving
  error?: boolean
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
function AIPlannerContent() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [toolRunning, setToolRunning] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [savingPlan, setSavingPlan] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ---- Fetch sessions on mount ----
  useEffect(() => {
    apiFetch<SessionInfo[]>("/sessions", { base: "ai", auth: false })
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // ---- Scroll to bottom on new messages ----
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ---- Auto-resize textarea ----
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px"
    }
  }, [input])

  // ---- Load history for a session ----
  const loadSession = async (sid: string) => {
    try {
      const { messages: hist } = await apiFetch<{
        messages: { role: "user" | "assistant"; content: string; tool_calls?: string[]; plan?: GenerateResponse | null; created_at: string }[]
        session_id: string
      }>(`/sessions/${sid}/history`, { base: "ai", auth: false })
      setSessionId(sid)
      setMessages(
        (hist || []).map((m, i) => ({
          id: `hist-${i}`,
          role: m.role,
          content: m.content,
          toolCalls: m.tool_calls,
          plan: m.plan,
          createdAt: new Date(m.created_at),
        }))
      )
    } catch {
      toast.error("Không thể tải lịch sử trò chuyện")
    }
  }

  // ---- Delete session ----
  const deleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions((prev) => prev.filter((s) => s.session_id !== sid))
    if (sessionId === sid) { setSessionId(null); setMessages([]) }
    try {
      await apiFetch(`/sessions/${sid}`, { base: "ai", auth: false, method: "DELETE" })
    } catch {
      toast.error("Không thể xoá phiên trò chuyện")
    }
  }

  // ---- New chat ----
  const handleNewChat = () => { setSessionId(null); setMessages([]) }

  // ---- Send message ----
  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || streaming) return
    setInput("")

    // Cancel any in-flight stream
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const userMsgId = `u-${Date.now()}`
    const aiMsgId   = `a-${Date.now()}`

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content, createdAt: new Date() },
      { id: aiMsgId,   role: "assistant", content: "", streaming: true, createdAt: new Date() },
    ])
    setStreaming(true)
    setToolRunning(null)

    await streamChat(sessionId, content, {
      signal: abortRef.current.signal,

      onToolStart(tool, label) {
        const lbl = label ?? getToolLabel(tool).vi
        setToolRunning(`${getToolLabel(tool).icon} ${lbl}`)
      },

      onToken(token) {
        setMessages((prev) =>
          prev.map((m) => m.id === aiMsgId ? { ...m, content: m.content + token } : m)
        )
      },

      onDone(newSessionId, fullText, plan, toolCalls) {
        // Persist session ID from first response
        setSessionId((prev) => {
          const sid = newSessionId ?? prev
          if (newSessionId && newSessionId !== prev) {
            // Add to sidebar
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
              ? { ...m, content: fullText, plan: plan ?? null, toolCalls: toolCalls ?? [], streaming: false }
              : m
          )
        )
        setStreaming(false)
        setToolRunning(null)
      },

      onError(msg) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: msg, error: true, streaming: false } : m
          )
        )
        setStreaming(false)
        setToolRunning(null)
      },
    })
  }, [input, sessionId, streaming])

  // ---- Save plan ----
  const handleSavePlan = async (plan: GenerateResponse) => {
    setSavingPlan(true)
    try {
      const today = new Date()
      const end   = new Date(today)
      end.setDate(today.getDate() + (plan.days?.length ?? 3) - 1)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      const it = await savePlanAsItinerary(plan, {
        title: `Lịch trình ${plan.days?.[0]?.date_str ?? ""}`,
        destination: plan.days?.[0]?.primary_area ?? "Việt Nam",
        start_date: fmt(today),
        end_date:   fmt(end),
        budget_vnd: plan.budget_recap?.total_budget_vnd ?? 0,
        guest_count: 2,
        tags: [],
      })
      toast.success("Đã lưu lịch trình!")
      router.push(`/itinerary/${it.id}/edit`)
    } catch {
      toast.error("Lưu lịch trình thất bại. Thử lại sau.")
    } finally {
      setSavingPlan(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ---- Render ----
  return (
    <div className="h-screen flex bg-[#f5f0e8] overflow-hidden">

      {/* ===== Sidebar ===== */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
            transition={{ type: "tween", duration: 0.2 }}
            className="fixed lg:relative z-30 w-72 h-full bg-[#1a1a1a] border-r border-white/10 flex flex-col"
          >
            {/* Logo */}
            <div className="px-5 py-5 border-b border-white/10">
              <Link href="/" className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-full bg-[#d4a853] flex items-center justify-center">
                  <Compass className="w-5 h-5 text-[#1a1a1a]" />
                </div>
                <span className="font-serif text-lg font-bold text-white">TripCompass</span>
              </Link>
              <Button onClick={handleNewChat} className="w-full bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] h-10 font-medium">
                <Plus className="w-4 h-4 mr-2" />
                Cuộc trò chuyện mới
              </Button>
            </div>

            {/* Sessions */}
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <div className="text-xs text-white/40 px-3 py-2 uppercase tracking-wider">Lịch sử</div>
              {sessions.length === 0 ? (
                <p className="text-xs text-white/30 px-3 py-2">Chưa có cuộc trò chuyện nào</p>
              ) : sessions.map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => loadSession(s.session_id)}
                  className={cn(
                    "group w-full text-left px-3 py-3 rounded-lg mb-1 transition-colors",
                    sessionId === s.session_id ? "bg-white/10" : "hover:bg-white/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <MessageSquare className="w-4 h-4 text-[#d4a853] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">
                        {s.destination ?? `Phiên ${s.session_id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-white/50 mt-0.5">{s.message_count} tin nhắn</div>
                      {s.last_active && (
                        <div className="text-xs text-white/40 mt-1">
                          {new Date(s.last_active).toLocaleDateString("vi-VN")}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => deleteSession(s.session_id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-white/50 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </button>
              ))}
            </div>

            {/* Back */}
            <Link href="/" className="px-5 py-4 border-t border-white/10 text-sm text-white/60 hover:text-white flex items-center gap-2">
              ← Quay về trang chủ
            </Link>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ===== Main ===== */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="bg-white border-b border-[#e8e2d9] px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -m-2 text-[#6b6b6b] hover:text-[#1a1a1a]"
              aria-label="Toggle sidebar"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#3d5a3d]/10 rounded-full">
              <Sparkles className="w-4 h-4 text-[#3d5a3d]" />
              <span className="text-sm font-medium text-[#3d5a3d]">Trợ lý AI TripCompass</span>
            </div>
          </div>
          <Link href="/ai-planner/quick">
            <Button variant="outline" className="border-[#e8e2d9] text-[#1a1a1a] h-9 bg-transparent">
              Tạo nhanh
            </Button>
          </Link>
        </header>

        {/* Tool chip (floating above messages when streaming) */}
        {toolRunning && (
          <div className="flex justify-center pt-3 shrink-0">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#d4a853]/10 border border-[#d4a853]/30 rounded-full text-sm text-[#a8842a]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {toolRunning}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center px-4">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl w-full text-center">
                <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-gradient-to-br from-[#3d5a3d] to-[#c4785a] flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#1a1a1a] mb-3 tracking-tight leading-tight">
                  Chào bạn! Đi đâu hôm nay?
                </h1>
                <p className="text-[#6b6b6b] mb-8 max-w-md mx-auto">
                  Mô tả chuyến đi bạn mơ ước, tôi sẽ giúp bạn thiết kế lịch trình chi tiết trong vài giây.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 max-w-xl mx-auto text-left">
                  {CHAT_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      className="group p-4 bg-white border border-[#e8e2d9] rounded-xl hover:border-[#3d5a3d] hover:shadow-md transition-all text-sm text-[#1a1a1a] flex items-start gap-3"
                    >
                      <Sparkles className="w-4 h-4 text-[#c4785a] shrink-0 mt-0.5" />
                      <span>{s}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onSavePlan={handleSavePlan}
                  savingPlan={savingPlan}
                  onRetry={() => {
                    // Find last user message and resend
                    const lastUser = [...messages].reverse().find((m) => m.role === "user")
                    if (lastUser) handleSend(lastUser.content)
                  }}
                />
              ))}
              {/* Typing indicator while waiting for first token */}
              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3d5a3d] to-[#c4785a] flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="px-4 py-3 bg-white border border-[#e8e2d9] rounded-2xl rounded-tl-sm inline-flex gap-1.5">
                    <span className="w-2 h-2 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[#e8e2d9] bg-white px-4 py-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative bg-[#f5f0e8] border border-[#e8e2d9] rounded-2xl focus-within:border-[#3d5a3d] focus-within:ring-2 focus-within:ring-[#3d5a3d]/10 transition-all">
              <textarea
                ref={textareaRef}
                id="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Mô tả chuyến đi của bạn..."
                rows={1}
                className="w-full px-4 py-3 pr-16 bg-transparent resize-none focus:outline-none text-[#1a1a1a] placeholder-[#8b8378]"
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                {streaming ? (
                  <button
                    onClick={() => { abortRef.current?.abort(); setStreaming(false); setToolRunning(null) }}
                    className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                    title="Dừng"
                  >
                    <span className="w-3 h-3 block bg-white rounded-sm" />
                  </button>
                ) : (
                  <button
                    id="chat-send"
                    onClick={() => handleSend()}
                    disabled={!input.trim() || streaming}
                    className="p-2 bg-[#1a1a1a] hover:bg-[#3d5a3d] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-[#8b8378] text-center mt-2">
              AI có thể mắc lỗi. Hãy kiểm tra kỹ thông tin quan trọng.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------
interface MessageBubbleProps {
  message: UiMessage
  onSavePlan: (plan: GenerateResponse) => void
  savingPlan: boolean
  onRetry: () => void
}

function MessageBubble({ message, onSavePlan, savingPlan, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user"
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", isUser ? "bg-[#3d5a3d]" : "bg-gradient-to-br from-[#3d5a3d] to-[#c4785a]")}>
        {isUser ? <UserIcon className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div className={cn("flex-1 min-w-0", isUser && "flex flex-col items-end")}>
        {/* Tool badges */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {message.toolCalls.map((tc) => {
              const lbl = getToolLabel(tc)
              return (
                <span key={tc} className="text-xs px-2 py-0.5 bg-[#d4a853]/10 text-[#a8842a] rounded-full border border-[#d4a853]/30">
                  {lbl.icon} {tc}
                </span>
              )
            })}
          </div>
        )}
        {/* Bubble */}
        {(message.content || message.streaming || message.error) && (
          <div className={cn(
            "inline-block max-w-full px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
            isUser ? "bg-[#3d5a3d] text-white rounded-tr-sm" : "bg-white border border-[#e8e2d9] text-[#1a1a1a] rounded-tl-sm",
            message.error && "border-red-200 bg-red-50 text-red-700",
          )}>
            {message.error && <AlertCircle className="w-4 h-4 inline mr-1" />}
            {message.content}
            {message.streaming && !message.content && (
              <span className="inline-flex gap-1 ml-1">
                <span className="w-1.5 h-1.5 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            )}
          </div>
        )}
        {/* Error retry */}
        {message.error && (
          <button onClick={onRetry} className="mt-2 flex items-center gap-1 text-xs text-[#6b6b6b] hover:text-[#3d5a3d]">
            <RefreshCw className="w-3 h-3" /> Thử lại
          </button>
        )}
        {/* Plan card */}
        {!isUser && message.plan && (
          <PlanPreviewCard plan={message.plan} onSave={onSavePlan} saving={savingPlan} />
        )}
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// PlanPreviewCard
// ---------------------------------------------------------------------------
function PlanPreviewCard({
  plan,
  onSave,
  saving,
}: {
  plan: GenerateResponse
  onSave: (p: GenerateResponse) => void
  saving: boolean
}) {
  const totalDays = plan.days?.length ?? 0
  const dest = plan.days?.[0]?.primary_area ?? "Việt Nam"
  const budget = plan.budget_recap?.total_budget_vnd ?? 0
  const violations = plan.violations?.filter((v) => v.severity === "error") ?? []

  return (
    <div className="mt-3 bg-gradient-to-br from-[#1a1a1a] to-[#2a2a2a] rounded-2xl overflow-hidden max-w-md w-full">
      <div className="relative h-36">
        <Image
          src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800"
          alt={dest}
          fill
          className="object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <div className="text-[#d4a853] text-xs uppercase tracking-wider mb-1">Lịch trình gợi ý</div>
          <div className="text-lg font-semibold text-white tracking-tight">{dest}</div>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-white">
          <div>
            <div className="flex items-center gap-1 text-white/60 text-xs mb-1"><MapPin className="w-3 h-3" /> Điểm đến</div>
            <div className="text-sm font-medium truncate">{dest}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-white/60 text-xs mb-1"><Calendar className="w-3 h-3" /> Thời gian</div>
            <div className="text-sm font-medium">{totalDays} ngày</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-white/60 text-xs mb-1"><Wallet className="w-3 h-3" /> Ngân sách</div>
            <div className="text-sm font-medium">{(budget / 1_000_000).toFixed(1)}M</div>
          </div>
        </div>

        {/* Days summary */}
        {plan.days && plan.days.length > 0 && (
          <div>
            <div className="text-white/60 text-xs mb-2">Tóm tắt theo ngày</div>
            <ul className="space-y-1">
              {plan.days.slice(0, 3).map((day) => (
                <li key={day.day_num} className="flex items-start gap-2 text-sm text-white/90">
                  <div className="w-5 h-5 rounded-full bg-[#d4a853]/20 text-[#d4a853] text-xs flex items-center justify-center shrink-0">{day.day_num}</div>
                  <span className="truncate">{day.slots.filter((s) => !s.is_buffer && s.place).map((s) => s.place?.name).join(" · ")}</span>
                </li>
              ))}
              {plan.days.length > 3 && <li className="text-xs text-white/40">+{plan.days.length - 3} ngày nữa...</li>}
            </ul>
          </div>
        )}

        {/* Violations */}
        {violations.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs text-red-300 space-y-1">
            {violations.map((v, i) => <div key={i}>⚠ {v.message}</div>)}
          </div>
        )}

        {/* Budget warning */}
        {plan.budget_warning && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-xs text-yellow-300">
            {plan.budget_warning}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={() => onSave(plan)}
            disabled={saving}
            className="flex-1 bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] h-10"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Lưu thành lịch trình"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default export — wrap with RequireAuth
// ---------------------------------------------------------------------------
export default function AIPlannerPage() {
  return (
    <RequireAuth>
      <AIPlannerContent />
    </RequireAuth>
  )
}
