"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Loader2, RefreshCw, Send, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/chat-markdown";
import { PlanPreviewCard } from "@/components/plan-preview-card";
import { streamChat } from "@/lib/stream-chat";
import { getToolLabel } from "@/lib/tool-labels";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "../_lib/types";

const QUICK_CHIPS = ["Gợi ý nhà hàng", "Thêm hoạt động", "Tối ưu lịch trình", "Chi phí dự kiến"];

export function AIChatPanel({
  isOpen,
  onClose,
  itineraryTitle,
  itineraryId,
  mode = "overlay",
  className,
}: {
  isOpen: boolean;
  onClose: () => void;
  itineraryTitle: string;
  itineraryId?: string;
  mode?: "docked" | "overlay";
  className?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      role: "assistant",
      content: `Xin chào! Tôi là trợ lý AI của TripCompass. Tôi có thể giúp bạn lên kế hoạch cho lịch trình "${itineraryTitle}". Bạn muốn tôi gợi ý điều gì?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [toolRunning, setToolRunning] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };
    const aiMsgId = `ai-${Date.now()}`;
    setMessages((p) => [
      ...p,
      userMsg,
      { id: aiMsgId, role: "assistant", content: "", timestamp: new Date(), streaming: true },
    ]);
    setInput("");
    setStreaming(true);
    setToolRunning(null);

    await streamChat(sessionId, content, {
      itineraryId,
      signal: abortRef.current.signal,
      onToolStart(tool, label) {
        const lbl = label ?? getToolLabel(tool).vi;
        setToolRunning(`${getToolLabel(tool).icon} ${lbl}`);
      },
      onToken(token) {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: m.content + token } : m)),
        );
      },
      onDone(newSessionId, fullText, plan, toolCalls) {
        setSessionId(newSessionId);
        const displayText = fullText.trim() || (
          plan
            ? "Mình đã tạo được lịch trình nháp. Bạn có thể xem nhanh bên dưới và lưu lại nếu phù hợp."
            : "Mình đã xử lý xong yêu cầu của bạn."
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  content: displayText,
                  plan: plan ?? null,
                  toolCalls: toolCalls ?? [],
                  streaming: false,
                  error: m.error && !plan,
                }
              : m,
          ),
        );
        setStreaming(false);
        setToolRunning(null);
      },
      onError(message) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? { ...m, content: message, error: true, streaming: false }
              : m,
          ),
        );
        setStreaming(false);
        setToolRunning(null);
      },
    });
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className={cn(
        "bg-[#fbf8f2] border-l border-[#e0d9cc] flex flex-col shadow-2xl",
        mode === "docked"
          ? "relative h-full w-[400px] shrink-0"
          : "fixed right-0 top-0 bottom-0 w-full sm:w-96 z-50",
        className,
      )}
    >
      {/* Header */}
      <div className="h-14 px-4 border-b border-[#e0d9cc] flex items-center justify-between bg-[#1a1a1a]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#d4a853] flex items-center justify-center">
            <Bot className="w-4 h-4 text-[#1a1a1a]" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#d4a853]">TripCompass AI</div>
            <div className="text-sm text-[#f5f0e8] font-medium">Trợ lý lập kế hoạch</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-[#f5f0e8]/70 hover:text-[#f5f0e8] hover:bg-white/10 rounded-md transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {toolRunning && (
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#d4a853]/10 border border-[#d4a853]/30 rounded-full text-xs text-[#8b6f47]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {toolRunning}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "")}>
            <div className={cn(
              "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
              m.role === "user" ? "bg-[#1a1a1a]" : "bg-[#3d5a3d]"
            )}>
              {m.role === "user"
                ? <User className="w-3.5 h-3.5 text-[#f5f0e8]" />
                : <Bot  className="w-3.5 h-3.5 text-[#f5f0e8]" />}
            </div>
            <div className="flex-1 min-w-0">
              {!m.error && m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {m.toolCalls.map((tool, index) => {
                    const label = getToolLabel(tool);
                    return (
                      <span key={`${tool}-${index}`} className="text-[11px] px-2 py-0.5 bg-[#d4a853]/10 text-[#8b6f47] rounded-full border border-[#d4a853]/30">
                        {label.icon} {tool}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className={cn(
                "max-w-full overflow-hidden break-words px-3 py-2.5 rounded-lg text-sm leading-relaxed [overflow-wrap:anywhere]",
                m.role === "user"
                  ? "bg-[#1a1a1a] text-[#f5f0e8] rounded-tr-sm"
                  : "bg-white text-[#1a1a1a] rounded-tl-sm border border-[#e8e2d9]",
                m.error && "border-red-200 bg-red-50 text-red-700",
              )}>
                {m.role === "user" ? m.content : <ChatMarkdown content={m.content} />}
                {m.streaming && !m.content && (
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-[#3d5a3d]/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                )}
              </div>
              {m.error && (
                <button
                  onClick={() => {
                    const lastUser = [...messages].reverse().find((msg) => msg.role === "user");
                    if (lastUser) send(lastUser.content);
                  }}
                  className="mt-2 flex items-center gap-1 text-xs text-[#6b6b6b] hover:text-[#3d5a3d]"
                >
                  <RefreshCw className="w-3 h-3" />
                  Thử lại
                </button>
              )}
              {m.role === "assistant" && m.plan && <PlanPreviewCard plan={m.plan} />}
            </div>
          </div>
        ))}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#e0d9cc]">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK_CHIPS.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              disabled={streaming}
              className="px-2.5 py-1 text-xs bg-white border border-[#e0d9cc] hover:border-[#1a1a1a] text-[#1a1a1a] rounded-full transition"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Hỏi AI về lịch trình..."
            className="flex-1 px-3 py-2.5 bg-white border border-[#e0d9cc] rounded-md text-[#1a1a1a] text-sm placeholder:text-[#8b8378] focus:outline-none focus:border-[#1a1a1a]"
          />
          <Button
            onClick={() => send()}
            disabled={!input.trim() || streaming}
            className="h-10 w-10 p-0 rounded-md bg-[#1a1a1a] hover:bg-black text-[#f5f0e8] disabled:opacity-50"
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
