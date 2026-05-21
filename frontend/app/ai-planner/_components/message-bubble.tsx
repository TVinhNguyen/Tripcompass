"use client"

// _components/message-bubble.tsx — Renders one AI / user message row.
// Pure presentational; consumes the UiMessage shape from use-ai-chat.

import { motion } from "framer-motion"
import { AlertCircle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { getToolLabel } from "@/lib/tool-labels"
import { ChatMarkdown } from "@/components/chat-markdown"
import { PlanPreviewCard } from "@/components/plan-preview-card"
import type { UiMessage } from "../_hooks/use-ai-chat"

interface Props {
  message: UiMessage
  onRetry: () => void
}

export function MessageBubble({ message, onRetry }: Props) {
  const isUser = message.role === "user"

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("min-w-0", isUser ? "max-w-[82%] sm:max-w-[72%]" : "w-full")}>
        {/* Tool badges */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 text-xs text-[#8b8378]">
            <span>Đã dùng: </span>
            {message.toolCalls.map((tc, index) => {
              const lbl = getToolLabel(tc)
              return (
                <span key={`${tc}-${index}`}>
                  {index > 0 ? ", " : ""}
                  {lbl.vi.replace(/^Đang\s+/i, "").replace(/\.\.\.$/, "")}
                </span>
              )
            })}
          </div>
        )}

        {/* Bubble */}
        {(message.content || message.streaming || message.error) && (
          <div
            className={cn(
              "max-w-full overflow-hidden break-words [overflow-wrap:anywhere]",
              isUser
                ? "inline-block rounded-2xl rounded-tr-md bg-[#3d5a3d] px-4 py-2.5 text-[15px] leading-6 text-white whitespace-pre-wrap"
                : "w-full px-0 py-1 text-[15px] leading-7 text-[#1a1a1a] sm:text-base",
              message.error && "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700",
            )}
          >
            {message.error && <AlertCircle className="w-4 h-4 inline mr-1" />}
            {isUser ? message.content : <ChatMarkdown content={message.content} />}
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
          <button
            onClick={onRetry}
            className="mt-2 flex items-center gap-1 text-xs text-[#6b6b6b] hover:text-[#3d5a3d]"
          >
            <RefreshCw className="w-3 h-3" /> Thử lại
          </button>
        )}

        {/* Plan preview */}
        {!isUser && message.plan && <PlanPreviewCard plan={message.plan} />}
      </div>
    </motion.div>
  )
}
