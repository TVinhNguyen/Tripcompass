"use client"

import { useState, use, useEffect } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { apiFetch } from "@/lib/api"
import type { Itinerary, Activity } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import {
  MapPin,
  Clock,
  Share2,
  Edit3,
  Utensils,
  Camera,
  Bus,
  Hotel,
  Sparkles,
  ArrowLeft,
  Star,
  Eye,
  Loader2,
  Copy,
} from "lucide-react"
import { cn } from "@/lib/utils"

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  FOOD:       <Utensils className="w-3.5 h-3.5" />,
  ATTRACTION: <Camera className="w-3.5 h-3.5" />,
  TRANSPORT:  <Bus className="w-3.5 h-3.5" />,
  STAY:       <Hotel className="w-3.5 h-3.5" />,
  ACTIVITY:   <Sparkles className="w-3.5 h-3.5" />,
}

const CATEGORY_LABELS: Record<string, string> = {
  FOOD:       "Ẩm thực",
  ATTRACTION: "Tham quan",
  TRANSPORT:  "Di chuyển",
  STAY:       "Lưu trú",
  ACTIVITY:   "Hoạt động",
}

const nf = new Intl.NumberFormat("vi-VN")

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export default function ItineraryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(1)

  useEffect(() => {
    apiFetch<Itinerary>(`/itineraries/${id}`)
      .then((data) => {
        setItinerary(data)
      })
      .catch(() => notFound())
      .finally(() => setLoading(false))
  }, [id])

  const handleClone = async () => {
    try {
      const cloned = await apiFetch<Itinerary>(`/itineraries/${id}/clone`, { method: "POST" })
      toast.success("Đã nhân bản lịch trình")
      window.location.href = `/itinerary/${cloned.id}/edit`
    } catch {
      toast.error("Nhân bản thất bại")
    }
  }

  const handleShare = () => {
    const url = `${window.location.origin}/itinerary/${id}/public`
    navigator.clipboard.writeText(url)
    toast.success("Đã sao chép link chia sẻ")
  }

  const handlePublish = async () => {
    try {
      const updated = await apiFetch<Itinerary>(`/itineraries/${id}/publish`, { method: "PATCH" })
      setItinerary(updated)
      toast.success("Đã xuất bản lịch trình!")
    } catch {
      toast.error("Xuất bản thất bại")
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
  const days = [...new Set(activities.map((a) => a.day_number))].sort((a, b) => a - b)
  if (days.length === 0) days.push(1)

  const dayActivities = activities.filter((a) => a.day_number === selectedDay)
  const dayCost = dayActivities.reduce((s, a) => s + (a.estimated_cost ?? 0), 0)
  const totalCost = activities.reduce((s, a) => s + (a.estimated_cost ?? 0), 0)

  const cover = itinerary.cover_image_url || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1200"

  const budgetLabel: Record<string, string> = {
    BUDGET: "Tiết kiệm", MODERATE: "Vừa phải", LUXURY: "Sang trọng"
  }

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero */}
      <section className="relative pt-16">
        <div className="relative h-[52vh] min-h-[420px] max-h-[560px] overflow-hidden">
          <Image src={cover} alt={itinerary.title} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/30 to-transparent" />

          {/* Back */}
          <div className="absolute top-6 left-0 right-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <Link href="/planner" className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 rounded-full text-white/90 text-sm transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />Quay lại
              </Link>
            </div>
          </div>

          {/* Title block */}
          <div className="absolute bottom-0 left-0 right-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <div className="flex items-center gap-3 mb-5 text-[11px] tracking-[0.24em] uppercase text-[#d4a853]">
                  <span>Itinerary</span>
                  <span className="w-6 h-px bg-[#d4a853]/60" />
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                    itinerary.status === "PUBLISHED" ? "bg-[#3d5a3d] text-white" : "bg-[#d4a853] text-[#1a1a1a]"
                  )}>
                    {itinerary.status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"}
                  </span>
                </div>
                <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-semibold text-white max-w-4xl leading-[1.08] tracking-tight">
                  {itinerary.title}
                </h1>
                <p className="mt-3 text-white/60 text-sm sm:text-base">{itinerary.destination}</p>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Meta strip */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-10">
          <div className="bg-white border border-[#e8e2d9] rounded-2xl shadow-[0_20px_60px_-30px_rgba(26,26,26,0.25)] overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#e8e2d9]">
              <Meta label="Thời gian" value={`${formatDate(itinerary.start_date)} – ${formatDate(itinerary.end_date)}`} />
              <Meta label="Ngân sách" value={budgetLabel[itinerary.budget_category] ?? itinerary.budget_category} />
              <Meta label="Hoạt động" value={`${activities.length}`} />
              <Meta label="Tổng chi phí" value={`${nf.format(totalCost)} đ`} />
            </div>

            <div className="border-t border-[#e8e2d9] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-sm text-[#8b8378]">
                <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{nf.format(itinerary.view_count)} lượt xem</span>
                {itinerary.rating > 0 && (
                  <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-[#d4a853] text-[#d4a853]" />{itinerary.rating.toFixed(1)}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleShare} className="h-10 px-3 border-[#e8e2d9] bg-transparent text-[#1a1a1a]">
                  <Share2 className="w-4 h-4 mr-2" />Chia sẻ
                </Button>
                <Button variant="outline" onClick={handleClone} className="h-10 px-3 border-[#e8e2d9] bg-transparent text-[#1a1a1a]">
                  <Copy className="w-4 h-4 mr-2" />Nhân bản
                </Button>
                {itinerary.status === "DRAFT" && (
                  <Button onClick={handlePublish} className="h-10 bg-[#3d5a3d] hover:bg-[#2d4a2d] text-white">
                    Xuất bản
                  </Button>
                )}
                <Button asChild className="h-10 bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white">
                  <Link href={`/itinerary/${id}/edit`}>
                    <Edit3 className="w-4 h-4 mr-2" />Chỉnh sửa
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Tags */}
          {itinerary.tags?.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {itinerary.tags.map((tag) => (
                <span key={tag} className="px-3 py-1 bg-white border border-[#e8e2d9] rounded-full text-xs text-[#6b6b6b]">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Timeline */}
      <section className="py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {activities.length === 0 ? (
            <div className="text-center py-16 text-[#6b6b6b]">
              <p className="mb-4">Lịch trình này chưa có hoạt động nào.</p>
              <Button asChild className="bg-[#3d5a3d] text-white hover:bg-[#2d4a2d]">
                <Link href={`/itinerary/${id}/edit`}><Edit3 className="w-4 h-4 mr-2" />Thêm hoạt động</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
              {/* Day picker */}
              <aside className="w-full lg:w-60 shrink-0">
                <div className="text-[11px] tracking-[0.24em] uppercase text-[#8b8378] mb-4">Chương trình</div>
                <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-6 leading-tight">
                  {days.length} ngày
                  <span className="block text-sm font-normal text-[#6b6b6b] mt-1">Chọn ngày để xem chi tiết</span>
                </h2>
                <div className="flex lg:flex-col gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
                  {days.map((day) => {
                    const acts = activities.filter((a) => a.day_number === day)
                    const cost = acts.reduce((s, a) => s + (a.estimated_cost ?? 0), 0)
                    const active = selectedDay === day
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={cn(
                          "group flex items-center justify-between gap-4 px-4 py-3 rounded-xl border transition-all text-left shrink-0 min-w-[240px] lg:min-w-0",
                          active ? "bg-[#1a1a1a] border-[#1a1a1a] text-white" : "bg-white border-[#e8e2d9] text-[#1a1a1a] hover:border-[#1a1a1a]/40"
                        )}
                      >
                        <span className={cn("text-[11px] tracking-[0.2em] uppercase tabular-nums font-mono", active ? "text-[#d4a853]" : "text-[#8b8378]")}>
                          Day {String(day).padStart(2, "0")}
                        </span>
                        <div className="text-right">
                          <div className="text-[11px] opacity-70 tabular-nums">{acts.length} hoạt động</div>
                          <div className="text-xs font-medium tabular-nums mt-0.5">{nf.format(cost)} đ</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </aside>

              {/* Day detail */}
              <div className="flex-1 min-w-0">
                <div className="flex items-end justify-between pb-6 border-b border-[#e8e2d9] mb-8">
                  <div>
                    <div className="text-[11px] tracking-[0.24em] uppercase text-[#8b8378] mb-1 font-mono tabular-nums">
                      Day {String(selectedDay).padStart(2, "0")} · {dayActivities.length} hoạt động
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a] leading-tight">
                      Hành trình ngày {selectedDay}
                    </h3>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] tracking-[0.2em] uppercase text-[#8b8378]">Chi phí</div>
                    <div className="text-xl font-semibold text-[#1a1a1a] tabular-nums">{nf.format(dayCost)} đ</div>
                  </div>
                </div>

                <div className="space-y-4">
                  {dayActivities.map((activity, index) => (
                    <motion.article
                      key={activity.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.04 }}
                      className="group grid grid-cols-[72px_1fr] sm:grid-cols-[96px_1fr] gap-4 sm:gap-6 bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:border-[#1a1a1a]/30 transition-colors"
                    >
                      {/* Time column */}
                      <div className="bg-[#1a1a1a] text-white p-4 flex flex-col justify-between">
                        <div>
                          <div className="text-[10px] tracking-[0.2em] uppercase text-[#d4a853]">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="mt-2 text-lg font-semibold tabular-nums leading-none">
                            {activity.start_time ?? "--:--"}
                          </div>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.15em] uppercase text-[#d4a853] font-medium">
                          {CATEGORY_ICONS[activity.category]}
                          {CATEGORY_LABELS[activity.category] ?? activity.category}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4 sm:p-5 min-w-0">
                        <h4 className="text-lg font-semibold text-[#1a1a1a] leading-snug">{activity.title}</h4>
                        {activity.notes && (
                          <p className="mt-3 text-sm text-[#6b6b6b] leading-relaxed">{activity.notes}</p>
                        )}
                        <div className="mt-4 pt-4 border-t border-dashed border-[#e8e2d9] flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                          {(activity.lat || activity.lng) && (
                            <span className="inline-flex items-center gap-1.5 text-[#6b6b6b]">
                              <MapPin className="w-3.5 h-3.5 text-[#3d5a3d]" />
                              {activity.lat?.toFixed(4)}, {activity.lng?.toFixed(4)}
                            </span>
                          )}
                          {activity.start_time && activity.end_time && (
                            <span className="inline-flex items-center gap-1.5 text-[#6b6b6b]">
                              <Clock className="w-3.5 h-3.5 text-[#c4785a]" />
                              {activity.start_time} – {activity.end_time}
                            </span>
                          )}
                          {activity.estimated_cost > 0 && (
                            <span className="ml-auto text-sm font-semibold text-[#1a1a1a] tabular-nums">
                              {nf.format(activity.estimated_cost)} đ
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5">
      <div className="text-[11px] tracking-[0.2em] uppercase text-[#8b8378]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[#1a1a1a] tabular-nums line-clamp-1">{value}</div>
    </div>
  )
}
