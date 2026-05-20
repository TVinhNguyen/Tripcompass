"use client"

import { use, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { ArrowLeft, MapPin, Calendar, Package, Share2, Sparkles, Check, Loader2, ExternalLink, Building2, Gift } from "lucide-react"
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

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero */}
      <section className="relative pt-20">
        <div className="relative aspect-[16/9] lg:aspect-[21/9] max-h-[520px] overflow-hidden">
          <Image src={cover} alt={combo.name} fill className="object-cover" priority />
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
                  {combo.name}
                </h1>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-white/80">
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{combo.destination}</span>
                  {combo.duration_days != null && (
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{combo.duration_days} ngày</span>
                  )}
                  {combo.provider && (
                    <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{combo.provider}</span>
                  )}
                  {combo.requires_overnight && (
                    <span className="px-2.5 py-1 bg-[#c4785a] text-white rounded-full text-xs font-semibold">
                      Cần qua đêm
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
            {/* Includes + Benefits */}
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-4 tracking-tight">Bao gồm trong combo</h2>
                {includes.length > 0 ? (
                  <ul className="space-y-2">
                    {includes.map((item) => (
                      <li key={item} className="flex items-start gap-3 bg-white border border-[#e8e2d9] rounded-xl px-4 py-3">
                        <Check className="w-4 h-4 text-[#3d5a3d] mt-0.5 shrink-0" />
                        <span className="text-sm text-[#1a1a1a]">{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="bg-white border border-[#e8e2d9] rounded-2xl p-10 text-center text-[#6b6b6b]">
                    <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>Chi tiết combo đang được cập nhật.</p>
                  </div>
                )}
              </div>

              {benefits.length > 0 && (
                <div>
                  <h2 className="text-2xl font-semibold text-[#1a1a1a] mb-4 tracking-tight inline-flex items-center gap-2">
                    <Gift className="w-5 h-5 text-[#c4785a]" />Ưu đãi đi kèm
                  </h2>
                  <ul className="space-y-2">
                    {benefits.map((b) => (
                      <li key={b} className="flex items-start gap-3 bg-[#d4a853]/10 border border-[#d4a853]/30 rounded-xl px-4 py-3">
                        <Sparkles className="w-4 h-4 text-[#8b6f47] mt-0.5 shrink-0" />
                        <span className="text-sm text-[#1a1a1a]">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside>
              <div className="sticky top-24 space-y-4">
                <div className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden">
                  <div className="p-6 border-b border-[#e8e2d9]">
                    <div className="text-[10px] font-mono tracking-[0.22em] uppercase text-[#8b8378] mb-1.5">Giá / người</div>
                    <div className="font-mono tabular-nums text-3xl font-semibold text-[#3d5a3d]">
                      {formatVnd(combo.price_per_person)}
                    </div>
                    {combo.provider && (
                      <div className="text-xs text-[#8b8378] mt-1">Cung cấp bởi {combo.provider}</div>
                    )}
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
