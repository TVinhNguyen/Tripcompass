"use client"

import { use, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft, Heart, Share2, MapPin, Star, Clock, Plus, Loader2,
  Phone, Globe, Timer, Sun, Trophy, ExternalLink, ChevronLeft, ChevronRight
} from "lucide-react"
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
  FOOD: "Ăn uống",
  STAY: "Lưu trú",
}

const BEST_TIME_LABELS: Record<string, string> = {
  morning: "🌅 Buổi sáng",
  afternoon: "☀️ Buổi chiều",
  evening: "🌆 Buổi tối",
  any: "⏰ Bất kỳ lúc nào",
}

function formatVnd(n: number | null | undefined): string {
  if (n == null) return "—"
  if (n === 0) return "Miễn phí"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₫`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K₫`
  return `${n}₫`
}

function formatDuration(mins: number | null | undefined): string {
  if (!mins) return "—"
  if (mins < 60) return `${mins} phút`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h${m}p` : `${h} giờ`
}

export default function PlaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [place, setPlace] = useState<Place | null>(null)
  const [related, setRelated] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<"desc" | "reviews" | "info">("desc")
  const [imgIdx, setImgIdx] = useState(0)

  useEffect(() => {
    apiFetch<Place>(`/places/${id}`)
      .then((p) => {
        setPlace(p)
        return apiFetch<PaginatedList<Place>>("/places", {
          auth: false,
          query: { destination: p.destination, category: p.category, limit: 4 },
        }).then(({ data }) => setRelated((data || []).filter((x) => x.id !== id).slice(0, 3)))
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

  // Upgrade TripAdvisor image URLs from small (photo-s, ~150px) to original (photo-o)
  const hiRes = (url: string) =>
    url.replace(/\/media\/photo-[a-z]\//, "/media/photo-o/")
       .replace(/(?<!dynamic-)media-cdn\.tripadvisor\.com/, "dynamic-media-cdn.tripadvisor.com")

  const images = [
    ...(place.cover_image ? [place.cover_image] : []),
    ...(place.images || []).filter((img) => img !== place.cover_image),
  ].filter(Boolean)

  const currentImg = hiRes(images[imgIdx] || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1200")
  const catLabel = CATEGORY_LABELS[place.category] || place.category
  const mapsUrl = place.latitude && place.longitude
    ? `https://www.google.com/maps?q=${place.latitude},${place.longitude}`
    : `https://www.google.com/maps/search/${encodeURIComponent(place.address || place.name)}`

  const awards = (place.metadata as any)?.awards as { type: string; year: string }[] | undefined
  const rank = (place.metadata as any)?.rank as number | undefined
  const rankTotal = (place.metadata as any)?.rank_total as number | undefined

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Back */}
      <div className="pt-20 pb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/places" className="inline-flex items-center gap-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a]">
            <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
          </Link>
        </div>
      </div>

      {/* Image Gallery */}
      <section className="pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative aspect-[16/9] lg:aspect-[21/9] rounded-2xl overflow-hidden bg-[#e8e2d9] group">
            <Image src={currentImg} alt={place.name} fill className="object-cover transition-all duration-500" priority />

            {/* Badges */}
            <div className="absolute top-4 left-4 flex gap-2">
              {place.must_visit && (
                <span className="px-3 py-1 bg-[#d4a853] text-[#1a1a1a] text-xs font-semibold rounded-full">
                  ⭐ Must Visit
                </span>
              )}
              {awards && awards.length > 0 && (
                <span className="px-3 py-1 bg-white/90 text-[#1a1a1a] text-xs font-semibold rounded-full flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-[#d4a853]" /> {awards[0].type} {awards[0].year}
                </span>
              )}
            </div>

            {/* Gallery nav */}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {images.map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)}
                      className={cn("w-2 h-2 rounded-full transition-all", i === imgIdx ? "bg-white w-4" : "bg-white/50")} />
                  ))}
                </div>
                <div className="absolute bottom-4 right-4 bg-black/40 text-white text-xs px-2 py-1 rounded-full">
                  {imgIdx + 1} / {images.length}
                </div>
              </>
            )}
          </div>

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
                  className={cn("relative w-20 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                    i === imgIdx ? "border-[#3d5a3d]" : "border-transparent opacity-60 hover:opacity-100")}>
                  <Image src={img} alt="" fill className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-8">

            {/* Main */}
            <div className="lg:col-span-2">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="inline-flex px-3 py-1 bg-[#3d5a3d]/10 text-[#3d5a3d] rounded-full text-sm">
                    {catLabel}
                  </span>
                  {rank && rankTotal && (
                    <span className="inline-flex px-3 py-1 bg-[#d4a853]/10 text-[#d4a853] rounded-full text-sm">
                      #{rank} / {rankTotal} tại {place.destination}
                    </span>
                  )}
                </div>

                <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#1a1a1a] mb-2 tracking-tight leading-tight">
                  {place.name}
                </h1>
                {place.name_en && place.name_en !== place.name && (
                  <p className="text-[#8b8378] text-sm mb-4 italic">{place.name_en}</p>
                )}

                {/* Quick stats */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#6b6b6b] mb-6">
                  {place.address && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-[#3d5a3d] transition-colors">
                      <MapPin className="w-4 h-4" />
                      {place.area ? `${place.area}, ${place.destination}` : place.destination}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {place.rating != null && (
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-[#d4a853] text-[#d4a853]" />
                      <span className="text-[#1a1a1a] font-semibold">{place.rating.toFixed(1)}</span>
                      <span>({place.review_count?.toLocaleString()} đánh giá)</span>
                    </span>
                  )}
                  {place.hours && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {place.hours}
                    </span>
                  )}
                  {place.recommended_duration && (
                    <span className="flex items-center gap-1">
                      <Timer className="w-4 h-4" />
                      {formatDuration(place.recommended_duration)}
                    </span>
                  )}
                  {place.best_time_of_day && (
                    <span className="flex items-center gap-1">
                      <Sun className="w-4 h-4" />
                      {BEST_TIME_LABELS[place.best_time_of_day] || place.best_time_of_day}
                    </span>
                  )}
                </div>

                {/* Tabs */}
                <div className="border-b border-[#e8e2d9] flex gap-1 mb-6 overflow-x-auto">
                  {([
                    { id: "desc" as const, label: "Mô tả" },
                    { id: "info" as const, label: "Thông tin chi tiết" },
                    { id: "reviews" as const, label: "Đánh giá" },
                  ]).map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className={cn("px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                        tab === t.id ? "border-[#3d5a3d] text-[#1a1a1a]" : "border-transparent text-[#6b6b6b] hover:text-[#1a1a1a]"
                      )}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Tab: Mô tả */}
                {tab === "desc" && (
                  <div className="space-y-6">
                    <p className="text-[#1a1a1a]/85 leading-relaxed whitespace-pre-line">{place.description}</p>

                    {/* Tags */}
                    {place.tags && place.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {place.tags.map((tag) => (
                          <span key={tag} className="px-3 py-1 bg-[#f5f0e8] border border-[#e8e2d9] rounded-full text-xs text-[#6b6b6b]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Map link */}
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                      className="relative h-48 rounded-2xl overflow-hidden bg-[#e8e2d9] flex items-center justify-center block hover:opacity-90 transition-opacity">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#3d5a3d]/20 to-[#d4a853]/10" />
                      <div className="relative z-10 bg-white rounded-xl px-5 py-3 shadow-lg flex items-center gap-3">
                        <MapPin className="w-5 h-5 text-[#c4785a]" />
                        <div>
                          <p className="text-sm font-medium text-[#1a1a1a]">{place.area || place.destination}</p>
                          <p className="text-xs text-[#6b6b6b]">Nhấn để mở Google Maps</p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-[#6b6b6b]" />
                      </div>
                    </a>
                  </div>
                )}

                {/* Tab: Thông tin chi tiết */}
                {tab === "info" && (
                  <div className="space-y-3">
                    {[
                      { label: "Địa chỉ đầy đủ", value: place.address, icon: MapPin },
                      { label: "Khu vực", value: place.area, icon: MapPin },
                      { label: "Giờ mở cửa", value: place.hours || null, icon: Clock },
                      { label: "Thời gian tham quan", value: formatDuration(place.recommended_duration), icon: Timer },
                      { label: "Thời điểm tốt nhất", value: place.best_time_of_day ? BEST_TIME_LABELS[place.best_time_of_day] : null, icon: Sun },
                      { label: "Điện thoại", value: place.phone, icon: Phone, href: place.phone ? `tel:${place.phone}` : undefined },
                      { label: "Website", value: place.website, icon: Globe, href: place.website, truncate: true },
                      { label: "Nguồn thông tin", value: place.source_url ? "TripAdvisor" : null, icon: ExternalLink, href: place.source_url || undefined },
                    ].filter((row) => row.value).map((row) => (
                      <div key={row.label} className="flex items-start gap-4 p-4 bg-white border border-[#e8e2d9] rounded-xl">
                        <row.icon className="w-5 h-5 text-[#8b8378] mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#8b8378] mb-0.5">{row.label}</p>
                          {row.href ? (
                            <a href={row.href} target="_blank" rel="noopener noreferrer"
                              className={cn("text-sm text-[#3d5a3d] hover:underline", row.truncate && "truncate block")}>
                              {row.value}
                            </a>
                          ) : (
                            <p className="text-sm text-[#1a1a1a]">{row.value}</p>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Awards */}
                    {awards && awards.length > 0 && (
                      <div className="p-4 bg-[#d4a853]/5 border border-[#d4a853]/20 rounded-xl">
                        <p className="text-xs text-[#8b8378] mb-2 flex items-center gap-1">
                          <Trophy className="w-4 h-4 text-[#d4a853]" /> Giải thưởng & Chứng nhận
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {awards.map((a, i) => (
                            <span key={i} className="px-3 py-1 bg-[#d4a853]/10 text-[#c49843] text-sm rounded-full font-medium">
                              {a.type} {a.year}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Đánh giá */}
                {tab === "reviews" && (
                  <div className="text-center py-16 bg-white border border-[#e8e2d9] rounded-2xl">
                    <Star className="w-10 h-10 text-[#d4a853] fill-[#d4a853] mx-auto mb-3" />
                    <p className="font-semibold text-[#1a1a1a] mb-1">{place.rating?.toFixed(1)} / 5</p>
                    <p className="text-sm text-[#6b6b6b] mb-4">{place.review_count?.toLocaleString()} đánh giá từ du khách</p>
                    {place.source_url && (
                      <a href={place.source_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-[#3d5a3d] hover:underline">
                        Xem đánh giá trên TripAdvisor <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                )}
              </motion.div>
            </div>

            {/* Sidebar */}
            <aside>
              <div className="sticky top-24 space-y-4">
                {/* Price + Actions */}
                <div className="bg-white border border-[#e8e2d9] rounded-2xl p-6">
                  <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-[#8b8378] mb-1">Giá vé cơ bản</div>
                  <div className="font-mono tabular-nums text-3xl font-semibold text-[#3d5a3d] mb-1">
                    {formatVnd(place.base_price)}
                  </div>
                  {place.base_price != null && place.base_price > 0 && (
                    <p className="text-xs text-[#8b8378] mb-5">/người · có thể thay đổi</p>
                  )}
                  {(!place.base_price || place.base_price === 0) && (
                    <p className="text-xs text-[#3d5a3d] mb-5">Không mất phí vào cửa</p>
                  )}

                  <Button className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-11 mb-2">
                    <Plus className="w-4 h-4 mr-2" /> Thêm vào lịch trình
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={toggleSave} disabled={saving} variant="outline"
                      className={cn("h-10 border-[#e8e2d9]", saved ? "bg-[#c4785a]/10 border-[#c4785a] text-[#c4785a]" : "text-[#1a1a1a]")}>
                      <Heart className={cn("w-4 h-4 mr-2", saved && "fill-[#c4785a]")} />
                      {saved ? "Đã lưu" : "Lưu"}
                    </Button>
                    <Button variant="outline" className="h-10 border-[#e8e2d9] text-[#1a1a1a] bg-transparent"
                      onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Đã sao chép link") }}>
                      <Share2 className="w-4 h-4 mr-2" /> Chia sẻ
                    </Button>
                  </div>
                </div>

                {/* Quick info */}
                <div className="bg-white border border-[#e8e2d9] rounded-2xl p-5 space-y-3">
                  {place.phone && (
                    <a href={`tel:${place.phone}`} className="flex items-center gap-3 text-sm text-[#1a1a1a] hover:text-[#3d5a3d]">
                      <Phone className="w-4 h-4 text-[#8b8378] shrink-0" />
                      <span>{place.phone}</span>
                    </a>
                  )}
                  {place.website && (
                    <a href={place.website} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 text-sm text-[#3d5a3d] hover:underline">
                      <Globe className="w-4 h-4 text-[#8b8378] shrink-0" />
                      <span className="truncate">{place.website.replace(/^https?:\/\//, "")}</span>
                    </a>
                  )}
                  {place.hours && (
                    <div className="flex items-center gap-3 text-sm text-[#1a1a1a]">
                      <Clock className="w-4 h-4 text-[#8b8378] shrink-0" />
                      <span>{place.hours}</span>
                    </div>
                  )}
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-[#3d5a3d] hover:underline">
                    <MapPin className="w-4 h-4 text-[#8b8378] shrink-0" />
                    <span>Xem bản đồ</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* Related */}
                {related.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-mono tracking-[0.24em] uppercase font-semibold text-[#1a1a1a] mb-3">
                      Địa điểm lân cận
                    </h3>
                    <div className="space-y-3">
                      {related.map((p) => (
                        <Link key={p.id} href={`/places/${p.id}`}
                          className="flex gap-3 p-3 bg-white border border-[#e8e2d9] rounded-xl hover:border-[#3d5a3d]/40 transition-colors">
                          <div className="relative w-20 h-16 rounded-lg overflow-hidden shrink-0">
                            <Image src={p.cover_image || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200"}
                              alt={p.name} fill className="object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-[#6b6b6b] mb-0.5">{CATEGORY_LABELS[p.category] || p.category}</div>
                            <div className="font-medium text-sm text-[#1a1a1a] line-clamp-2">{p.name}</div>
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
              <h2 className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a] mb-6 tracking-tight capitalize">
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
