"use client"

import { use, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, MapPin, Calendar, Star, Package, Share2, Sparkles, Check, Loader2 } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"
import type { Combo } from "@/lib/types"
import { toast } from "sonner"

function formatVnd(n: number | null | undefined): string {
  if (!n) return "Miễn phí"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₫`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K₫`
  return `${n}₫`
}

const CATEGORY_LABELS: Record<string, string> = {
  FOOD: "Ẩm thực", ATTRACTION: "Tham quan", STAY: "Lưu trú",
}

export default function ComboDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [combo, setCombo] = useState<Combo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<Combo>(`/combos/${id}`, { auth: false })
      .then(setCombo)
      .catch(() => notFound())
      .finally(() => setLoading(false))
  }, [id])

  const handleUseCombo = () => {
    // Navigate to new itinerary creation, pre-seeding the destination
    router.push(combo ? `/itinerary/new?destination=${encodeURIComponent(combo.destination)}&days=${combo.num_days}` : "/itinerary/new")
  }

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success("Đã sao chép link combo")
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
      </main>
    )
  }

  if (!combo) return null

  const cover = combo.cover_image || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1200"
  const places = combo.places ?? []

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero */}
      <section className="relative pt-20">
        <div className="relative aspect-[16/9] lg:aspect-[21/9] max-h-[520px] overflow-hidden">
          <Image src={cover} alt={combo.title} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/40 to-transparent" />
          <div className="absolute inset-0 flex items-end">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
              <Link href="/combos" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-4">
                <ArrowLeft className="w-4 h-4" />Danh sách combo
              </Link>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#d4a853] text-[#1a1a1a] rounded-full text-xs font-semibold mb-4">
                  <Package className="w-3.5 h-3.5" />Combo trọn gói
                </div>
                <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-semibold text-white mb-4 max-w-4xl tracking-tight leading-tight">
                  {combo.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-white/80">
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{combo.destination}</span>
                  <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{combo.num_days} ngày</span>
                  <span className="flex items-center gap-1.5"><Package className="w-4 h-4" />{combo.num_places} địa điểm</span>
                  {combo.savings_pct && combo.savings_pct > 0 && (
                    <span className="px-2.5 py-1 bg-[#c4785a] text-white rounded-full text-xs font-semibold">
                      Tiết kiệm {combo.savings_pct}%
                    </span>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Places */}
            <div className="lg:col-span-2">
              <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-2 tracking-tight">Địa điểm trong combo</h2>
              {combo.description && (
                <p className="text-[#6b6b6b] mb-8">{combo.description}</p>
              )}

              {places.length > 0 ? (
                <div className="space-y-4">
                  {places.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.04 }}
                    >
                      <Link
                        href={`/places/${p.id}`}
                        className="flex gap-4 p-4 bg-white border border-[#e8e2d9] rounded-xl hover:border-[#3d5a3d]/40 transition-colors group"
                      >
                        <div className="relative w-20 h-20 rounded-lg overflow-hidden shrink-0">
                          <Image
                            src={p.cover_image || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=200"}
                            alt={p.name} fill className="object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#c4785a] uppercase tracking-wider mb-1">
                            {CATEGORY_LABELS[p.category] ?? p.category}
                          </div>
                          <h4 className="font-medium text-[#1a1a1a] group-hover:text-[#3d5a3d] truncate">{p.name}</h4>
                          {p.description && (
                            <p className="text-sm text-[#6b6b6b] line-clamp-1 mt-0.5">{p.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-[#8b8378]">
                            {p.rating && p.rating > 0 && (
                              <span className="flex items-center gap-1">
                                <Star className="w-3 h-3 fill-[#d4a853] text-[#d4a853]" />{p.rating.toFixed(1)}
                              </span>
                            )}
                            {p.area && <span><MapPin className="inline w-3 h-3 mr-0.5" />{p.area}</span>}
                          </div>
                        </div>
                        {p.base_price && p.base_price > 0 && (
                          <div className="text-sm font-semibold text-[#3d5a3d] shrink-0">{formatVnd(p.base_price)}</div>
                        )}
                      </Link>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-[#e8e2d9] rounded-2xl p-10 text-center text-[#6b6b6b]">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Chi tiết địa điểm đang được cập nhật.</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside>
              <div className="sticky top-24 space-y-4">
                <div className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-[#e8e2d9]">
                    <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-[#8b8378] mb-1.5">Tổng gói</div>
                    <div className="font-mono tabular-nums text-3xl font-semibold text-[#3d5a3d]">
                      {formatVnd(combo.total_cost)}
                    </div>
                    {combo.savings_pct && combo.savings_pct > 0 && (
                      <div className="text-xs text-[#c4785a] font-medium mt-1">Tiết kiệm {combo.savings_pct}% so với đặt lẻ</div>
                    )}
                    <div className="text-xs text-[#8b8378] mt-1">Đã bao gồm tất cả điểm đến chính</div>
                  </div>

                  <div className="p-6 space-y-2 text-sm">
                    {[
                      "Lịch trình đã tối ưu chi tiết",
                      "Địa điểm đã được tuyển chọn",
                      "Ước tính ngân sách chính xác",
                      "Có thể tuỳ chỉnh theo nhu cầu",
                    ].map((b) => (
                      <div key={b} className="flex items-start gap-2 text-[#1a1a1a]">
                        <Check className="w-4 h-4 text-[#3d5a3d] shrink-0 mt-0.5" /><span>{b}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 pt-2 space-y-2">
                    <Button onClick={handleUseCombo} className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-11">
                      <Sparkles className="w-4 h-4 mr-2" />Dùng combo này
                    </Button>
                    <Button onClick={handleShare} variant="outline" className="w-full border-[#e8e2d9] text-[#1a1a1a] bg-transparent h-11">
                      <Share2 className="w-4 h-4 mr-2" />Chia sẻ combo
                    </Button>
                  </div>
                </div>

                {/* Tags */}
                {combo.tags?.length > 0 && (
                  <div className="bg-white border border-[#e8e2d9] rounded-2xl p-5">
                    <div className="font-medium text-sm text-[#1a1a1a] mb-3">Phù hợp cho</div>
                    <div className="flex flex-wrap gap-2">
                      {combo.tags.map((t) => (
                        <span key={t} className="px-3 py-1 bg-[#f5f0e8] text-[#6b6b6b] rounded-full text-xs">#{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
