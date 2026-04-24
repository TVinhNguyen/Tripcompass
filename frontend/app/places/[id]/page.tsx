"use client"

import { use, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, Heart, Share2, MapPin, Star, Clock, Plus, Loader2 } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { PlaceCard } from "@/components/place-card"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"
import type { Place, PaginatedList } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const CATEGORY_LABELS: Record<string, string> = {
  ATTRACTION: "Tham quan",
  FOOD:       "Ăn uống",
  STAY:       "Lưu trú",
}

function formatVnd(n: number | null | undefined): string {
  if (!n) return "Miễn phí"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₫`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K₫`
  return `${n}₫`
}

const MOCK_REVIEWS = [
  { name: "Mai Linh", rating: 5, date: "2 ngày trước", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100", content: "Địa điểm tuyệt vời! Không gian đẹp, nhân viên thân thiện. Sẽ quay lại lần nữa." },
  { name: "Minh Tuấn", rating: 4, date: "1 tuần trước", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100", content: "Giá hợp lý, chất lượng tốt. Khuyến khích đặt chỗ trước vì rất đông khách." },
  { name: "Hương Giang", rating: 5, date: "2 tuần trước", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100", content: "Đáng để trải nghiệm. Đặc biệt ấn tượng với dịch vụ và khung cảnh." },
]

export default function PlaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [place, setPlace]   = useState<Place | null>(null)
  const [related, setRelated] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab]       = useState<"desc" | "reviews" | "combos" | "itineraries">("desc")

  useEffect(() => {
    apiFetch<{ place: Place }>(`/places/${id}`)
      .then(({ place: p }) => {
        setPlace(p)
        // fetch related places in same destination
        return apiFetch<PaginatedList<Place>>("/places", {
          auth: false,
          query: { destination: p.destination, category: p.category, limit: 3 },
        }).then(({ data }) => setRelated((data || []).filter((x) => x.id !== id)))
      })
      .catch(() => notFound())
      .finally(() => setLoading(false))
  }, [id])

  const toggleSave = async () => {
    if (!place || saving) return
    setSaving(true)
    const next = !saved
    setSaved(next)
    try {
      if (next) {
        await apiFetch("/user/saved-places", { method: "POST", body: { place_id: place.id } })
        toast.success("Đã lưu địa điểm")
      } else {
        await apiFetch(`/user/saved-places/${place.id}`, { method: "DELETE" })
        toast.success("Đã bỏ lưu")
      }
    } catch {
      setSaved(!next)
      toast.error("Thao tác thất bại")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
      </main>
    )
  }

  if (!place) return null

  const cover = place.cover_image || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1200"
  const catLabel = CATEGORY_LABELS[place.category] || place.category
  const hours = place.open_time && place.close_time
    ? `${place.open_time} – ${place.close_time}`
    : null
  const location = [place.address, place.area, place.destination].filter(Boolean).join(", ")

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Back */}
      <div className="pt-20 pb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/places" className="inline-flex items-center gap-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a]">
            <ArrowLeft className="w-4 h-4" />
            Quay lại danh sách
          </Link>
        </div>
      </div>

      {/* Cover Image */}
      <section className="pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative aspect-[16/9] lg:aspect-[21/9] rounded-2xl overflow-hidden bg-[#e8e2d9]">
            <Image
              src={cover}
              alt={place.name}
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main */}
            <div className="lg:col-span-2">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="inline-flex px-3 py-1 bg-[#3d5a3d]/10 text-[#3d5a3d] rounded-full text-sm mb-4">
                  {catLabel}
                </div>
                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#1a1a1a] mb-4 tracking-tight leading-tight">
                  {place.name}
                </h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#6b6b6b] mb-6">
                  {location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {location}
                    </span>
                  )}
                  {place.rating != null && (
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-[#d4a853] text-[#d4a853]" />
                      <span className="text-[#1a1a1a] font-semibold">{place.rating.toFixed(1)}</span>
                      <span>({place.review_count} đánh giá)</span>
                    </span>
                  )}
                  {hours && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {hours}
                    </span>
                  )}
                </div>

                {/* Tabs */}
                <div className="border-b border-[#e8e2d9] flex gap-1 mb-6 overflow-x-auto">
                  {([
                    { id: "desc"        as const, label: "Mô tả" },
                    { id: "reviews"     as const, label: "Đánh giá" },
                    { id: "combos"      as const, label: "Combo liên quan" },
                    { id: "itineraries" as const, label: "Xuất hiện trong lịch trình" },
                  ]).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={cn(
                        "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                        tab === t.id
                          ? "border-[#3d5a3d] text-[#1a1a1a]"
                          : "border-transparent text-[#6b6b6b] hover:text-[#1a1a1a]",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                {tab === "desc" && (
                  <div className="space-y-6">
                    <p className="text-[#1a1a1a]/85 leading-relaxed">{place.description}</p>
                    {/* Static map placeholder */}
                    <div className="relative h-64 rounded-2xl overflow-hidden bg-[#e8e2d9]">
                      <Image
                        src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1200"
                        alt="Map"
                        fill
                        className="object-cover opacity-70"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-white rounded-xl px-4 py-2 shadow-lg flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-[#c4785a]" />
                          <span className="text-sm font-medium">{location || place.destination}</span>
                        </div>
                      </div>
                    </div>
                    {/* Tags */}
                    <div className="flex flex-wrap gap-2">
                      {place.tags.map((tag) => (
                        <span key={tag} className="px-3 py-1 bg-[#f5f0e8] border border-[#e8e2d9] rounded-full text-xs text-[#6b6b6b]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "reviews" && (
                  <div className="space-y-4">
                    {MOCK_REVIEWS.map((r, i) => (
                      <div key={i} className="p-5 bg-white border border-[#e8e2d9] rounded-2xl">
                        <div className="flex items-start gap-3 mb-3">
                          <Image src={r.avatar} alt={r.name} width={40} height={40} className="w-10 h-10 rounded-full object-cover" />
                          <div className="flex-1">
                            <div className="font-medium text-[#1a1a1a]">{r.name}</div>
                            <div className="flex items-center gap-2 text-xs text-[#8b8378]">
                              <div className="flex">
                                {Array.from({ length: 5 }).map((_, j) => (
                                  <Star key={j} className={cn("w-3 h-3", j < r.rating ? "fill-[#d4a853] text-[#d4a853]" : "text-[#e8e2d9]")} />
                                ))}
                              </div>
                              <span>•</span>
                              <span>{r.date}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-[#1a1a1a]/80 leading-relaxed">{r.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "combos" && (
                  <div className="text-center py-12 text-[#6b6b6b]">
                    Đang cập nhật combo liên quan cho địa điểm này...
                  </div>
                )}

                {tab === "itineraries" && (
                  <div className="text-center py-12 text-[#6b6b6b]">
                    Địa điểm này đã xuất hiện trong nhiều lịch trình từ cộng đồng.
                  </div>
                )}
              </motion.div>
            </div>

            {/* Sidebar */}
            <aside>
              <div className="sticky top-24 space-y-4">
                {/* Action card */}
                <div className="bg-white border border-[#e8e2d9] rounded-2xl p-6">
                  <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-[#8b8378] mb-1.5">Giá cơ bản</div>
                  <div className="font-mono tabular-nums text-2xl font-semibold text-[#3d5a3d] mb-5">
                    {formatVnd(place.base_price)}
                  </div>
                  <Button className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-11 mb-2">
                    <Plus className="w-4 h-4 mr-2" />
                    Thêm vào lịch trình
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={toggleSave}
                      disabled={saving}
                      variant="outline"
                      className={cn(
                        "h-10 border-[#e8e2d9]",
                        saved ? "bg-[#c4785a]/10 border-[#c4785a] text-[#c4785a]" : "text-[#1a1a1a]",
                      )}
                    >
                      <Heart className={cn("w-4 h-4 mr-2", saved && "fill-[#c4785a]")} />
                      {saved ? "Đã lưu" : "Lưu"}
                    </Button>
                    <Button variant="outline" className="h-10 border-[#e8e2d9] text-[#1a1a1a] bg-transparent">
                      <Share2 className="w-4 h-4 mr-2" />
                      Chia sẻ
                    </Button>
                  </div>
                </div>

                {/* Related */}
                {related.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-mono tracking-[0.24em] uppercase font-semibold text-[#1a1a1a] mb-3">
                      Cùng khu vực
                    </h3>
                    <div className="space-y-3">
                      {related.map((p) => (
                        <Link
                          key={p.id}
                          href={`/places/${p.id}`}
                          className="flex gap-3 p-3 bg-white border border-[#e8e2d9] rounded-xl hover:border-[#3d5a3d]/40 transition-colors"
                        >
                          <div className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0">
                            <Image
                              src={p.cover_image || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200"}
                              alt={p.name} fill className="object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-[#6b6b6b] mb-0.5">{CATEGORY_LABELS[p.category] || p.category}</div>
                            <div className="font-medium text-sm text-[#1a1a1a] truncate">{p.name}</div>
                            {p.rating != null && (
                              <div className="flex items-center gap-1 text-xs text-[#6b6b6b] mt-1">
                                <Star className="w-3 h-3 fill-[#d4a853] text-[#d4a853]" />
                                {p.rating.toFixed(1)}
                              </div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* More in destination */}
          {related.length > 0 && (
            <div className="mt-16 pt-12 border-t border-[#e8e2d9]">
              <h2 className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a] mb-6 tracking-tight">
                Khám phá thêm tại {place.destination}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {related.map((p, i) => (
                  <PlaceCard key={p.id} place={p} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}
