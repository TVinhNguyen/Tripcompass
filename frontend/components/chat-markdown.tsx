"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

/* ── Custom renderers for chat markdown ────────────────────────────────── */
const components: Components = {
  // Headings
  h1: ({ children }) => (
    <h3 className="text-base font-bold text-[#1a1a1a] mt-3 mb-1.5 first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="text-sm font-bold text-[#1a1a1a] mt-3 mb-1 first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="text-sm font-semibold text-[#1a1a1a] mt-2 mb-1 first:mt-0">{children}</h5>
  ),

  // Paragraphs
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,

  // Bold / italic
  strong: ({ children }) => <strong className="font-semibold text-[#1a1a1a]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[#6b6b6b]">{children}</em>,

  // Lists
  ul: ({ children }) => <ul className="mb-2 last:mb-0 space-y-0.5 ml-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 last:mb-0 space-y-0.5 ml-4 list-decimal">{children}</ol>,
  li: ({ children }) => (
    <li className="text-sm leading-relaxed flex items-start gap-1.5">
      <span className="mt-1.5 w-1 h-1 bg-[#3d5a3d] rounded-full shrink-0 only:hidden" />
      <span className="flex-1">{children}</span>
    </li>
  ),

  // Horizontal rule
  hr: () => <hr className="my-3 border-t border-[#e8e2d9]" />,

  // Links
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#3d5a3d] underline hover:text-[#2a4a2a]">
      {children}
    </a>
  ),

  // Code (inline and block)
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-")
    if (isBlock) {
      return (
        <code className="block bg-[#1a1a1a] text-[#e8e2d9] text-xs rounded-lg p-3 my-2 overflow-x-auto whitespace-pre">
          {children}
        </code>
      )
    }
    return (
      <code className="bg-[#f5f0e8] text-[#a8842a] text-[13px] px-1 py-0.5 rounded font-mono">
        {children}
      </code>
    )
  },

  // Tables (GFM)
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#f5f0e8] text-[#1a1a1a]">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-[#e8e2d9]">{children}</tr>,
  th: ({ children }) => (
    <th className="text-left text-xs font-semibold px-2 py-1.5 whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => (
    <td className="text-left text-xs px-2 py-1.5">{children}</td>
  ),

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[#d4a853] pl-3 my-2 text-[#6b6b6b] italic">
      {children}
    </blockquote>
  ),
}

/* ── ChatMarkdown component ────────────────────────────────────────────── */
interface ChatMarkdownProps {
  content: string
  className?: string
}

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
