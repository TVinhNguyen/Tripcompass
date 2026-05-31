"use client"

import { use, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { motion } from "framer-motion"
import {
  Copy, Check, Compass, ArrowLeft, Eye, Star, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/hooks/use-auth"
import type { Itinerary, Activity } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatVND } from "@/lib/format"

const CATEGORY_LABELS: Record<string, string> = {
  FOOD: "Ẩm thực", ATTRACTION: "Tham quan",
  TRANSPORT: "Di chuyển", STAY: "Lưu trú", ACTIVITY: "Hoạt động",
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export default function PublicItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [cloning, setCloning] = useState(false)

  useEffect(() => {
    // GET /itineraries/:id/public (no auth required)
    apiFetch<Itinerary>(`/itineraries/${id}/public`, { auth: false })
      .then(setItinerary)
      .catch(() => notFound())
      .finally(() => setLoading(false))
  }, [id])

  const handleCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/itinerary/${id}/public`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClone = async () => {
    if (!user) {
      window.location.href = `/auth/login?redirect=/itinerary/${id}/public`
      return
    }
    setCloning(true)
    try {
      const cloned = await apiFetch<Itinerary>(`/itineraries/${id}/clone`, { method: "POST" })
      toast.success("Đã lưu về tài khoản!")
      window.location.href = `/itinerary/${cloned.id}/edit`
    } catch {
      toast.error("Không thể nhân bản")
    } finally {
      setCloning(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
      </main>
    )
  }

  if (!itinerary) return null

  const activities: Activity[] = itinerary.activities ?? []
  const grouped = activities.reduce<Record<number, Activity[]>>((acc, a) => {
    ;(acc[a.day_number] = acc[a.day_number] || []).push(a)
    return acc
  }, {})
  const totalCost = activities.reduce((s, a) => s + (a.estimated_cost ?? 0), 0)
  const cover = itinerary.cover_image_url || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1200"

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      {/* Slim header */}
      <header className="sticky top-0 z-40 bg-[#1a1a1a] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#d4a853] flex items-center justify-center">
              <Compass className="w-4 h-4 text-[#1a1a1a]" />
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">TripCompass</span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Đã sao chép" : "Sao chép link"}
            </button>
            {!user && (
              <Link href="/auth/login">
                <Button className="bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] h-9 text-sm">Đăng nhập</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="relative h-[44vh] min-h-[380px] max-h-[520px] overflow-hidden">
          <Image src={cover} alt={itinerary.title} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/40 to-transparent" />
          <div className="absolute inset-0 flex items-end">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <div className="flex items-center gap-3 text-[11px] tracking-[0.24em] uppercase text-[#d4a853] mb-5">
                  <span>Shared itinerary</span>
                  <span className="w-6 h-px bg-[#d4a853]/60" />
                  <span className="text-white/60">{itinerary.destination}</span>
                </div>
                <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-semibold text-white max-w-4xl leading-[1.08] tracking-tight">
                  {itinerary.title}
                </h1>
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-white/80 text-sm">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <span className="text-white/50 text-[11px] tracking-[0.2em] uppercase">Khách</span>
                    {itinerary.guest_count}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Eye className="w-3.5 h-3.5 text-white/50" />{itinerary.view_count.toLocaleString("vi-VN")}
                  </span>
                  {itinerary.rating > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-[#d4a853] text-[#d4a853]" />{itinerary.rating.toFixed(1)}
                    </span>
                  )}
                  <span className="text-white/50 text-xs">
                    {formatDate(itinerary.start_date)} – {formatDate(itinerary.end_date)}
                  </span>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1fr_320px] gap-10 lg:gap-14">
            {/* Timeline */}
            <div>
              <div className="flex items-end justify-between pb-6 border-b border-[#e8e2d9] mb-10">
                <div>
                  <div className="text-[11px] tracking-[0.24em] uppercase text-[#8b8378] mb-1">Chương trình</div>
                  <h2 className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a] leading-tight">Lịch trình chi tiết</h2>
                </div>
                <div className="text-right">
                  <div className="text-[11px] tracking-[0.2em] uppercase text-[#8b8378]">Hoạt động</div>
                  <div className="text-xl font-semibold text-[#1a1a1a] tabular-nums">{activities.length}</div>
                </div>
              </div>

              <div className="space-y-14">
                {Object.entries(grouped)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([day, acts]) => (
                    <div key={day}>
                      <div className="flex items-center gap-4 mb-6">
                        <div className="text-[11px] tracking-[0.24em] uppercase text-[#8b8378] font-mono tabular-nums">
                          Day {String(day).padStart(2, "0")}
                        </div>
                        <div className="flex-1 h-px bg-[#e8e2d9]" />
                        <div className="text-[11px] text-[#8b8378] tabular-nums">{acts.length} hoạt động</div>
                      </div>
                      <div className="space-y-3">
                        {acts.map((a, i) => (
                          <article
                            key={a.id}
                            className="flex items-stretch bg-white border border-[#e8e2d9] rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(26,26,26,0.04)] hover:shadow-[0_10px_24px_-10px_rgba(26,26,26,0.15)] hover:border-[#3d5a3d]/30 transition-all duration-300"
                          >
                            {/* Time rail — number + time grouped together, centered */}
                            <div className="w-16 sm:w-20 shrink-0 bg-[#1a1a1a] text-white flex flex-col items-center justify-center gap-1.5 py-4 px-2">
                              <div className="text-[10px] tracking-[0.2em] uppercase text-[#d4a853] font-mono tabular-nums">
                                {String(i + 1).padStart(2, "0")}
                              </div>
                              <div className="text-sm font-semibold tabular-nums">{(a.start_time ?? "--:--").slice(0, 5)}</div>
                            </div>
                            {/* Content — title block and price share one baseline */}
                            <div className="flex-1 min-w-0 p-4 flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-[11px] tracking-[0.16em] uppercase text-[#8b8378] mb-1.5">
                                  {CATEGORY_LABELS[a.category] ?? a.category}
                                </div>
                                <h4 className="text-base font-semibold text-[#1a1a1a] leading-snug">{a.title}</h4>
                                {a.notes && (
                                  <p className="mt-1.5 text-sm text-[#6b6b6b] leading-relaxed line-clamp-2">{a.notes}</p>
                                )}
                              </div>
                              {a.estimated_cost > 0 && (
                                <div className="shrink-0 text-right">
                                  <div className="text-[10px] tracking-[0.16em] uppercase text-[#8b8378] mb-0.5">Chi phí</div>
                                  <span className="text-sm font-semibold text-[#1a1a1a] tabular-nums">
                                    {formatVND(a.estimated_cost)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Sidebar */}
            <aside>
              <div className="sticky top-20 space-y-4">
                {/* Stats */}
                <div className="bg-white border border-[#e8e2d9] rounded-2xl p-5">
                  <div className="text-[11px] tracking-[0.24em] uppercase text-[#8b8378] mb-4">Tổng quan</div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-[#6b6b6b]">Tổng chi phí</dt>
                      <dd className="font-semibold text-[#1a1a1a] tabular-nums">{formatVND(totalCost)}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-[#6b6b6b]">Hoạt động</dt>
                      <dd className="font-medium text-[#1a1a1a] tabular-nums">{activities.length}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-[#6b6b6b]">Ngân sách</dt>
                      <dd className="font-medium text-[#1a1a1a]">
                        {{ BUDGET: "Tiết kiệm", MODERATE: "Vừa phải", LUXURY: "Sang trọng" }[itinerary.budget_category]}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Clone CTA */}
                <div className="bg-[#1a1a1a] rounded-2xl p-5 text-white">
                  <div className="text-[11px] tracking-[0.24em] uppercase text-[#d4a853] mb-3">Lưu lại</div>
                  <h3 className="text-lg font-semibold leading-tight">Nhân bản lịch trình này</h3>
                  <p className="mt-2 text-sm text-white/60">Tuỳ chỉnh thành chuyến đi của riêng bạn.</p>
                  <Button
                    onClick={handleClone}
                    disabled={cloning}
                    className="mt-4 w-full h-10 bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] font-medium"
                  >
                    {cloning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {user ? "Lưu về tài khoản" : "Đăng nhập để lưu"}
                  </Button>
                  {!user && (
                    <Link href="/auth/register" className="block text-center text-xs text-white/50 hover:text-white mt-3 underline underline-offset-4">
                      Đăng ký miễn phí
                    </Link>
                  )}
                </div>

                {/* Tags */}
                {itinerary.tags?.length > 0 && (
                  <div className="bg-white border border-[#e8e2d9] rounded-2xl p-5">
                    <div className="text-[11px] tracking-[0.24em] uppercase text-[#8b8378] mb-3">Chủ đề</div>
                    <div className="flex flex-wrap gap-2">
                      {itinerary.tags.map((t) => (
                        <span key={t} className="px-3 py-1 bg-[#f5f0e8] text-[#6b6b6b] rounded-full text-xs">#{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>

          <div className="mt-16 pt-10 border-t border-[#e8e2d9] text-center">
            <Link href="/explore" className={cn("inline-flex items-center gap-2 text-[#6b6b6b] hover:text-[#1a1a1a] text-sm")}>
              <ArrowLeft className="w-4 h-4" />
              Khám phá thêm lịch trình cộng đồng
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#1a1a1a] py-6 text-center text-white/40 text-xs">
        Powered by <Link href="/" className="text-[#d4a853] hover:text-[#c49843]">TripCompass</Link>
      </footer>
    </main>
  )
}
