"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

/* ── Custom renderers for chat markdown ────────────────────────────────── */
const components: Components = {
  // Headings
  h1: ({ children }) => (
    <h3 className="mt-5 mb-2 text-[17px] font-semibold leading-7 text-[#1a1a1a] first:mt-0">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="mt-4 mb-1.5 text-base font-semibold leading-7 text-[#1a1a1a] first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-3 mb-1 text-[15px] font-semibold leading-6 text-[#1a1a1a] first:mt-0">{children}</h5>
  ),

  // Paragraphs
  p: ({ children }) => <p className="mb-3 text-[15px] leading-7 text-[#2b2925] last:mb-0 sm:text-base">{children}</p>,

  // Bold / italic
  strong: ({ children }) => <strong className="font-semibold text-[#1a1a1a]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[#6b6b6b]">{children}</em>,

  // Lists
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => (
    <li className="pl-0.5 text-[15px] leading-7 text-[#2b2925] marker:text-[#8b8378] sm:text-base [&>p]:mb-0">{children}</li>
  ),

  // Horizontal rule
  hr: () => <hr className="my-4 border-t border-[#e8e2d9]" />,

  // Links
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[#315431] underline underline-offset-2 hover:text-[#263f26]">
      {children}
    </a>
  ),

  // Code (inline and block)
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-")
    if (isBlock) {
      return (
        <code className="my-3 block overflow-x-auto whitespace-pre rounded-lg bg-[#1f1e1b] p-3 text-xs leading-6 text-[#eee8dd]">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-[#eee8dd] px-1 py-0.5 font-mono text-[13px] text-[#7b6120]">
        {children}
      </code>
    )
  },

  // Tables (GFM)
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-[#e8e2d9]">
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
    <blockquote className="my-3 border-l border-[#c9c0b3] pl-3 text-[#5f5a52]">
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
