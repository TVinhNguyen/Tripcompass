"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Loader2, Send, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "../_lib/types";

const PLANNER_AI = process.env.NEXT_PUBLIC_PLANNER_AI_URL ?? "";
const QUICK_CHIPS = ["Gợi ý nhà hàng", "Thêm hoạt động", "Tối ưu lịch trình", "Chi phí dự kiến"];

export function AIChatPanel({
  isOpen,
  onClose,
  itineraryTitle,
  itineraryId,
}: {
  isOpen: boolean;
  onClose: () => void;
  itineraryTitle: string;
  itineraryId?: string;
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
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // SSE stream from Planner-AI
      const res = await fetch(`${PLANNER_AI}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          session_id: itineraryId ?? "default",
          context: { itinerary_title: itineraryTitle },
        }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setMessages((p) => [
        ...p,
        { id: (Date.now() + 1).toString(), role: "assistant", content: data.reply ?? data.message ?? "Đã hiểu!", timestamp: new Date() },
      ]);
    } catch {
      // Graceful fallback
      setMessages((p) => [
        ...p,
        { id: (Date.now() + 1).toString(), role: "assistant", content: "Xin lỗi, tôi gặp sự cố kết nối. Vui lòng thử lại sau.", timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed right-0 top-0 bottom-0 w-full sm:w-96 bg-[#fbf8f2] border-l border-[#e0d9cc] z-50 flex flex-col shadow-2xl"
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
            <div className={cn(
              "flex-1 px-3 py-2.5 rounded-lg text-sm leading-relaxed",
              m.role === "user"
                ? "bg-[#1a1a1a] text-[#f5f0e8] rounded-tr-sm"
                : "bg-white text-[#1a1a1a] rounded-tl-sm border border-[#e8e2d9]"
            )}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-md bg-[#3d5a3d] flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-[#f5f0e8]" />
            </div>
            <div className="px-3 py-2.5 bg-white rounded-lg rounded-tl-sm border border-[#e8e2d9]">
              <Loader2 className="w-4 h-4 animate-spin text-[#3d5a3d]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#e0d9cc]">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK_CHIPS.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
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
            onClick={send}
            disabled={!input.trim() || loading}
            className="h-10 w-10 p-0 rounded-md bg-[#1a1a1a] hover:bg-black text-[#f5f0e8] disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
