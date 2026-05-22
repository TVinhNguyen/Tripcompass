"use client"

import { use, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, MapPin, Calendar, Package, Share2, Sparkles, Check, Loader2, ExternalLink, Building2, Gift, Wallet, Moon, RefreshCw } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"
import type { Combo } from "@/lib/types"
import { toast } from "sonner"

function formatVnd(n: number | null | undefined): string {
  if (n == null) return "Liên hệ"
  if (n === 0) return "Miễn phí"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₫`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K₫`
  return `${n}₫`
}

function formatDate(d: string | undefined): string {
  if (!d) return "Chưa cập nhật"
  return new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
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
    // Navigate to new itinerary creation, pre-seeding destination and length
    router.push(combo ? `/itinerary/new?destination=${encodeURIComponent(combo.destination)}&days=${combo.duration_days ?? ""}` : "/itinerary/new")
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
  const includes = combo.includes ?? []
  const benefits = combo.benefits ?? []
  const quickFacts = [
    { label: "Điểm đến", value: combo.destination, icon: MapPin },
    { label: "Thời lượng", value: combo.duration_days ? `${combo.duration_days} ngày` : "Chưa cập nhật", icon: Calendar },
    { label: "Giá / người", value: formatVnd(combo.price_per_person), icon: Wallet },
    { label: "Lưu trú", value: combo.requires_overnight ? "Có qua đêm" : "Không bắt buộc", icon: Moon },
    { label: "Nhà cung cấp", value: combo.provider || "Chưa cập nhật", icon: Building2 },
    { label: "Cập nhật giá", value: formatDate(combo.price_updated_at), icon: RefreshCw },
  ]

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      <section className="relative pt-20 bg-[#1a1a1a]">
        <div className="relative min-h-[560px] overflow-hidden">
          <Image src={cover} alt={combo.name} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/72 to-[#1a1a1a]/24" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a]/92 via-[#1a1a1a]/58 to-transparent" />

          <div className="relative z-10 flex min-h-[560px] items-end">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
              <Link href="/combos" className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/80 backdrop-blur-sm transition-colors hover:bg-white/15 hover:text-white">
                <ArrowLeft className="w-4 h-4" />Danh sách combo
              </Link>

              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="max-w-4xl">
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#d4a853] px-3 py-1 text-xs font-semibold text-[#1a1a1a]">
                    <Package className="w-3.5 h-3.5" />Combo du lịch
                  </span>
                  {combo.requires_overnight && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c4785a] px-3 py-1 text-xs font-semibold text-white">
                      <Moon className="w-3.5 h-3.5" />Qua đêm
                    </span>
                  )}
                </div>
                <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-semibold text-white max-w-4xl tracking-tight leading-[1.06]">
                  {combo.name}
                </h1>
                <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/78">
                  <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-[#d4a853]" />{combo.destination}</span>
                  <span className="inline-flex items-center gap-1.5"><Wallet className="w-4 h-4 text-[#d4a853]" />{formatVnd(combo.price_per_person)} / người</span>
                  {combo.duration_days != null && (
                    <span className="inline-flex items-center gap-1.5"><Calendar className="w-4 h-4 text-[#d4a853]" />{combo.duration_days} ngày</span>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            <div className="min-w-0 space-y-8">
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {quickFacts.map((fact) => {
                  const Icon = fact.icon
                  return (
                    <div key={fact.label} className="rounded-xl border border-[#e8e2d9] bg-white p-4">
                      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#f5f0e8] text-[#3d5a3d]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#8b8378]">{fact.label}</div>
                      <div className="mt-1 text-sm font-semibold text-[#1a1a1a] line-clamp-2">{fact.value}</div>
                    </div>
                  )
                })}
              </div>

              <section>
                <div className="mb-4 flex items-center justify-between gap-4 border-b border-[#e8e2d9] pb-4">
                  <div>
                    <div className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#8b8378]">Chi tiết</div>
                    <h2 className="mt-1 text-2xl font-semibold text-[#1a1a1a] tracking-tight">Bao gồm trong combo</h2>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#6b6b6b] border border-[#e8e2d9]">
                    {includes.length} mục
                  </span>
                </div>
                {includes.length > 0 ? (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {includes.map((item) => (
                      <li key={item} className="flex items-start gap-3 rounded-xl border border-[#e8e2d9] bg-white px-4 py-3">
                        <Check className="w-4 h-4 text-[#3d5a3d] mt-0.5 shrink-0" />
                        <span className="text-sm text-[#1a1a1a]">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-[#e8e2d9] bg-white p-8 text-center text-[#6b6b6b]">
                    <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>Danh sách hạng mục bao gồm đang được cập nhật.</p>
                  </div>
                )}
              </section>

              <section>
                <div className="mb-4 flex items-center gap-2 border-b border-[#e8e2d9] pb-4">
                  <Gift className="w-5 h-5 text-[#c4785a]" />
                  <h2 className="text-2xl font-semibold text-[#1a1a1a] tracking-tight">Ưu đãi đi kèm</h2>
                </div>
                {benefits.length > 0 ? (
                  <ul className="space-y-3">
                    {benefits.map((b) => (
                      <li key={b} className="flex items-start gap-3 rounded-xl border border-[#d4a853]/30 bg-[#d4a853]/10 px-4 py-3">
                        <Sparkles className="w-4 h-4 text-[#8b6f47] mt-0.5 shrink-0" />
                        <span className="text-sm text-[#1a1a1a]">{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-[#e8e2d9] bg-white p-5 text-sm text-[#6b6b6b]">
                    Combo này chưa có ưu đãi riêng được ghi nhận.
                  </div>
                )}
              </section>
            </div>

            <aside>
              <div className="sticky top-24">
                <div className="overflow-hidden rounded-xl border border-[#e8e2d9] bg-white">
                  <div className="p-6 border-b border-[#e8e2d9] bg-[#fbf8f2]">
                    <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-[#8b8378] mb-1.5">Giá / người</div>
                    <div className="font-mono tabular-nums text-3xl font-semibold text-[#3d5a3d]">
                      {formatVnd(combo.price_per_person)}
                    </div>
                    {combo.provider && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#8b8378]">
                        <Building2 className="h-3.5 w-3.5" />{combo.provider}
                      </div>
                    )}
                  </div>

                  <div className="p-6 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[#6b6b6b]">Điểm đến</span>
                      <span className="font-medium text-[#1a1a1a] text-right">{combo.destination}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[#6b6b6b]">Thời lượng</span>
                      <span className="font-medium text-[#1a1a1a] text-right">{combo.duration_days ? `${combo.duration_days} ngày` : "Chưa cập nhật"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[#6b6b6b]">Qua đêm</span>
                      <span className="font-medium text-[#1a1a1a] text-right">{combo.requires_overnight ? "Có" : "Không"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[#6b6b6b]">Cập nhật giá</span>
                      <span className="font-medium text-[#1a1a1a] text-right">{formatDate(combo.price_updated_at)}</span>
                    </div>
                    {includes.length > 0 && (
                      <div className="pt-3 border-t border-[#e8e2d9]">
                        <div className="mb-2 text-[10px] font-mono tracking-[0.2em] uppercase text-[#8b8378]">Bao gồm nổi bật</div>
                        <div className="space-y-2">
                          {includes.slice(0, 3).map((item) => (
                            <div key={item} className="flex items-start gap-2 text-[#1a1a1a]">
                              <Check className="w-4 h-4 text-[#3d5a3d] shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-6 pt-0 space-y-2">
                    <Button onClick={handleUseCombo} className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-11">
                      <Sparkles className="w-4 h-4 mr-2" />Dùng combo này
                    </Button>
                    {combo.book_url && (
                      <Button asChild variant="outline" className="w-full border-[#e8e2d9] text-[#1a1a1a] bg-transparent h-11">
                        <a href={combo.book_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-4 h-4 mr-2" />Đặt với nhà cung cấp
                        </a>
                      </Button>
                    )}
                    <Button onClick={handleShare} variant="outline" className="w-full border-[#e8e2d9] text-[#1a1a1a] bg-transparent h-11">
                      <Share2 className="w-4 h-4 mr-2" />Chia sẻ combo
                    </Button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
