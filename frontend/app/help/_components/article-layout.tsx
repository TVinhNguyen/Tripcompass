// Shared layout for /help/* article pages — consistent header, breadcrumb,
// reading width, and back-to-help footer. Children are the prose body.

import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft, ArrowRight, Compass } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

interface ArticleLayoutProps {
  title: string
  eyebrow: string
  intro: string
  children: ReactNode
  // Optional next-article hint at the bottom — guides the user through a
  // natural reading order rather than dumping them back on /help.
  next?: { href: string; title: string }
}

export function ArticleLayout({ title, eyebrow, intro, children, next }: ArticleLayoutProps) {
  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      <article className="pt-28 pb-16 lg:pt-36">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            href="/help"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-[#6b6b6b] transition-colors hover:text-[#1a1a1a]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Trung tâm hỗ trợ
          </Link>

          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c4785a]">
            {eyebrow}
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#1a1a1a] sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#6b6b6b] sm:text-lg">{intro}</p>

          <div className="mt-10 prose-help">{children}</div>

          {next && (
            <div className="mt-12 rounded-2xl border border-[#e8e2d9] bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8b8378]">
                Đọc tiếp
              </p>
              <Link
                href={next.href}
                className="group mt-2 flex items-center justify-between gap-3"
              >
                <span className="text-lg font-semibold tracking-tight text-[#1a1a1a]">
                  {next.title}
                </span>
                <ArrowRight className="h-5 w-5 text-[#3d5a3d] transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          )}

          <div className="mt-10 flex items-center justify-between rounded-2xl bg-[#3d5a3d]/5 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3d5a3d]/15 text-[#3d5a3d]">
                <Compass className="h-4 w-4" />
              </div>
              <p className="text-sm text-[#1a1a1a]">Sẵn sàng thử?</p>
            </div>
            <Link
              href="/planner"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#3d5a3d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d4a2d]"
            >
              Mở lịch trình của tôi
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </article>

      <Footer />

      {/* Minimal prose styles scoped to article body. Avoids pulling in
          @tailwindcss/typography for just 5 pages. */}
      <style>{`
        .prose-help h2 {
          font-family: var(--font-playfair, serif);
          font-size: 1.5rem;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: #1a1a1a;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
        }
        .prose-help h3 {
          font-size: 1.05rem;
          font-weight: 600;
          color: #1a1a1a;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .prose-help p {
          color: #4f4a43;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .prose-help ul, .prose-help ol {
          color: #4f4a43;
          line-height: 1.75;
          margin-bottom: 1rem;
          padding-left: 1.25rem;
        }
        .prose-help ul { list-style: disc; }
        .prose-help ol { list-style: decimal; }
        .prose-help li { margin-bottom: 0.5rem; }
        .prose-help li::marker { color: #c4785a; }
        .prose-help strong { color: #1a1a1a; font-weight: 600; }
        .prose-help code {
          background: #f5f0e8;
          border: 1px solid #e8e2d9;
          border-radius: 4px;
          padding: 0.1em 0.4em;
          font-size: 0.9em;
        }
        .prose-help .tip {
          margin: 1.25rem 0;
          padding: 1rem 1.25rem;
          background: #d4a853/10;
          background-color: rgba(212,168,83,0.10);
          border-left: 3px solid #d4a853;
          border-radius: 0 0.75rem 0.75rem 0;
          color: #4f4a43;
        }
        .prose-help .tip strong { color: #8b6f47; }
      `}</style>
    </main>
  )
}
