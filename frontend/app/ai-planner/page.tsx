"use client"

// /ai-planner — pure presentation. Data flow + SSE lives in
// _hooks/use-ai-chat.ts; MessageBubble in _components/.

import type React from "react"
import { useEffect, useRef, useState, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sparkles, Send, Plus, Trash2, Loader2, MessageSquare,
  Compass, LayoutGrid, Lightbulb, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { RequireAuth } from "@/components/require-auth"
import { cn } from "@/lib/utils"
import { CHAT_SUGGESTIONS } from "@/lib/tool-labels"
import { PlacePicker } from "@/components/place-picker"
import { useAuth } from "@/hooks/use-auth"
import { useAiChat } from "./_hooks/use-ai-chat"
import { MessageBubble } from "./_components/message-bubble"

function AIPlannerContent() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") || ""

  const {
    sessions, sessionId, messages, input, streaming, toolRunning,
    setInput, loadSession, deleteSession, startNewChat, sendMessage, stopStreaming,
  } = useAiChat(initialQuery)

  // First-time inline tip just above the input — shown for users who haven't
  // sent a message yet AND haven't dismissed the tip before. Keyed by user.id
  // so a shared browser still respects each account.
  const [showTip, setShowTip] = useState(false)
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    const key = `tripcompass_aiplanner_tip_seen_${user.id}`
    setShowTip(window.localStorage.getItem(key) !== "1")
  }, [user?.id])

  const dismissTip = () => {
    if (!user?.id || typeof window === "undefined") return
    window.localStorage.setItem(`tripcompass_aiplanner_tip_seen_${user.id}`, "1")
    setShowTip(false)
  }

  // ---- Responsive sidebar ----
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const sync = () => {
      setIsDesktop(media.matches)
      setSidebarOpen(media.matches)
    }
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  // ---- Auto-scroll to latest message ----
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ---- Auto-resize textarea ----
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px"
    }
  }, [input])

  // ---- Place picker (destination derived from active session) ----
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDest, setPickerDest] = useState("Việt Nam")
  const handleOpenPicker = () => {
    const dest =
      sessions.find((s) => s.session_id === sessionId)?.destination ??
      sessions[0]?.destination ??
      "Việt Nam"
    setPickerDest(dest)
    setPickerOpen(true)
  }

  // ---- Session row: load + close sidebar on mobile ----
  const handleLoadSession = (sid: string) => {
    loadSession(sid)
    if (!isDesktop) setSidebarOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleRetry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user")
    if (lastUser) sendMessage(lastUser.content)
  }

  return (
    <div className="h-dvh flex bg-[#f5f0e8] overflow-hidden">
      {sidebarOpen && !isDesktop && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/45 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Đóng lịch sử trò chuyện"
        />
      )}

      {/* ===== Sidebar ===== */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
            transition={{ type: "tween", duration: 0.2 }}
            className="fixed lg:relative z-30 w-[min(20rem,calc(100vw-2rem))] lg:w-72 h-full bg-[#1a1a1a] border-r border-white/10 flex flex-col shadow-2xl lg:shadow-none"
          >
            <div className="px-5 py-5 border-b border-white/10">
              <Link href="/" className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-full bg-[#d4a853] flex items-center justify-center">
                  <Compass className="w-5 h-5 text-[#1a1a1a]" />
                </div>
                <span className="font-serif text-lg font-bold text-white">TripCompass</span>
              </Link>
              <Button onClick={startNewChat} className="w-full bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] h-10 font-medium">
                <Plus className="w-4 h-4 mr-2" />
                Cuộc trò chuyện mới
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-3">
              <div className="text-xs text-white/40 px-3 py-2 uppercase tracking-wider">Lịch sử</div>
              {sessions.length === 0 ? (
                <p className="text-xs text-white/30 px-3 py-2">Chưa có cuộc trò chuyện nào</p>
              ) : sessions.map((s) => (
                <div
                  key={s.session_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleLoadSession(s.session_id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleLoadSession(s.session_id)
                    }
                  }}
                  className={cn(
                    "group w-full cursor-pointer text-left px-3 py-3 rounded-lg mb-1 transition-colors",
                    sessionId === s.session_id ? "bg-white/10" : "hover:bg-white/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <MessageSquare className="w-4 h-4 text-[#d4a853] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">
                        {s.destination ?? s.title ?? `Phiên ${s.session_id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-white/50 mt-0.5">{s.message_count} tin nhắn</div>
                      {s.last_active && (
                        <div className="text-xs text-white/40 mt-1">
                          {new Date(s.last_active).toLocaleDateString("vi-VN")}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.session_id) }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-white/50 hover:text-red-400"
                      aria-label="Xoá phiên"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Link href="/" className="px-5 py-4 border-t border-white/10 text-sm text-white/60 hover:text-white flex items-center gap-2">
              ← Quay về trang chủ
            </Link>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ===== Main ===== */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#e8e2d9] px-3 sm:px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -m-2 text-[#6b6b6b] hover:text-[#1a1a1a]"
              aria-label="Ẩn/hiện sidebar"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <div className="flex min-w-0 items-center gap-2 px-2.5 sm:px-3 py-1.5 bg-[#3d5a3d]/10 rounded-full">
              <Sparkles className="w-4 h-4 text-[#3d5a3d]" />
              <span className="truncate text-sm font-medium text-[#3d5a3d]">Trợ lý AI TripCompass</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline" size="sm"
              onClick={handleOpenPicker}
              className="border-[#e8e2d9] text-[#1a1a1a] h-9 bg-transparent gap-1.5"
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">Chọn địa điểm</span>
            </Button>
            <Link href="/ai-planner/quick">
              <Button variant="outline" className="border-[#e8e2d9] text-[#1a1a1a] h-9 bg-transparent px-2.5 sm:px-4">
                <span className="hidden sm:inline">Tạo nhanh</span>
                <span className="sm:hidden">Nhanh</span>
              </Button>
            </Link>
          </div>
        </header>

        {/* Tool chip while streaming */}
        {toolRunning && (
          <div className="flex justify-center pt-3 shrink-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e8e2d9] bg-white/80 px-3.5 py-1.5 text-sm text-[#6b6b6b] shadow-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3d5a3d]" />
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
                      onClick={() => sendMessage(s)}
                      className="group rounded-xl border border-[#e8e2d9] bg-white p-4 text-left text-sm leading-6 text-[#1a1a1a] transition-all hover:border-[#3d5a3d] hover:shadow-md"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-6">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onRetry={handleRetry} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[#e8e2d9] bg-white px-3 sm:px-4 py-3 sm:py-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            {/* First-time tip — only before the user has sent anything. */}
            {showTip && messages.length === 0 && (
              <div className="relative mb-3 flex items-start gap-3 rounded-xl border border-[#d4a853]/30 bg-[#d4a853]/10 px-4 py-2.5 pr-9 text-sm text-[#6b5a2a]">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#8b6f47]" />
                <p className="leading-relaxed">
                  Mô tả chuyến đi bằng câu tự nhiên — ví dụ: <em>"Đi Đà Nẵng 3 ngày
                  với 2 người, ngân sách 5 triệu, thích biển và ẩm thực"</em>. Càng cụ
                  thể, gợi ý càng sát.
                </p>
                <button
                  type="button"
                  onClick={dismissTip}
                  aria-label="Đóng gợi ý"
                  className="absolute right-2 top-2 rounded-full p-1 text-[#8b6f47] transition-colors hover:bg-[#d4a853]/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="relative bg-[#f5f0e8] border border-[#e8e2d9] rounded-2xl focus-within:border-[#3d5a3d] focus-within:ring-2 focus-within:ring-[#3d5a3d]/10 transition-all">
              <textarea
                ref={textareaRef}
                id="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Mô tả chuyến đi của bạn..."
                rows={1}
                className="w-full max-h-40 px-4 py-3 pr-16 bg-transparent resize-none focus:outline-none text-[#1a1a1a] placeholder-[#8b8378]"
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                {streaming ? (
                  <button
                    onClick={stopStreaming}
                    className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                    title="Dừng"
                    aria-label="Dừng stream"
                  >
                    <span className="w-3 h-3 block bg-white rounded-sm" />
                  </button>
                ) : (
                  <button
                    id="chat-send"
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || streaming}
                    className="p-2 bg-[#1a1a1a] hover:bg-[#3d5a3d] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    aria-label="Gửi tin nhắn"
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

      {/* Place picker */}
      {pickerOpen && (
        <PlacePicker
          destination={pickerDest}
          onClose={() => setPickerOpen(false)}
          onSend={(msg) => sendMessage(msg)}
        />
      )}
    </div>
  )
}

export default function AIPlannerPage() {
  return (
    <RequireAuth>
      <Suspense>
        <AIPlannerContent />
      </Suspense>
    </RequireAuth>
  )
}
