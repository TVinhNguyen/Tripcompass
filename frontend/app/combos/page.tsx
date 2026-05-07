"use client"

import { useEffect, useState, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { MapPin, Calendar, Package, Search, Loader2 } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { apiFetch } from "@/lib/api"
import type { Combo, PaginatedList } from "@/lib/types"
import { cn } from "@/lib/utils"

const CITIES = [
  "Đà Nẵng", "Hội An", "Đà Lạt", "Nha Trang", "Hà Nội",
  "Sapa", "Phú Quốc", "Vịnh Hạ Long", "Huế", "Hồ Chí Minh",
]

function formatVnd(n: number | null | undefined): string {
  if (!n) return "Miễn phí"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₫`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K₫`
  return `${n}₫`
}

export default function CombosPage() {
  const [destination, setDestination] = useState("all")
  const [query, setQuery]             = useState("")
  const [combos, setCombos]           = useState<Combo[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [loading, setLoading]         = useState(true)
  const LIMIT = 12

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<PaginatedList<Combo>>("/combos", {
        auth: false,
        query: {
          destination: destination !== "all" ? destination : undefined,
          page,
          limit: LIMIT,
        },
      })
      setCombos(res.data ?? [])
      setTotal(res.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [destination, page])

  useEffect(() => { load() }, [load])

  // Client-side search filter on top of API results
  const filtered = query
    ? combos.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
    : combos

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero */}
      <section className="relative pt-24 pb-12 overflow-hidden">
        <div className="absolute inset-0">
          <Image src="https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=1920" alt="" fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a]/95 via-[#1a1a1a]/80 to-[#1a1a1a]/60" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#d4a853]/20 rounded-full text-[#d4a853] text-xs tracking-wider uppercase mb-4">
              <Package className="w-3.5 h-3.5" />Combo trọn gói
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold text-white mb-5 leading-tight tracking-tight">
              Combo du lịch<br />
              <span className="text-[#d4a853]">trọn gói tiết kiệm</span>
            </h1>
            <p className="text-white/70 text-lg">Lịch trình được tuyển chọn kỹ lưỡng – đặt một lần, đi trọn vẹn.</p>
          </motion.div>
        </div>
      </section>

      {/* Filters */}
      <section className="sticky top-16 z-20 bg-[#f5f0e8]/95 backdrop-blur-md border-b border-[#e8e2d9] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm combo..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#e8e2d9] rounded-lg text-sm focus:outline-none focus:border-[#3d5a3d]"
              />
            </div>
            <select
              value={destination}
              onChange={(e) => { setDestination(e.target.value); setPage(1) }}
              className="px-3 py-2.5 bg-white border border-[#e8e2d9] rounded-lg text-sm focus:outline-none focus:border-[#3d5a3d]"
            >
              <option value="all">Tất cả điểm đến</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
            </div>
          ) : (
            <>
              <p className="text-[#6b6b6b] mb-6">
                <span className="text-[#1a1a1a] font-semibold">{filtered.length}</span> combo phù hợp
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((combo, i) => (
                  <ComboCard key={combo.id} combo={combo} index={i} />
                ))}
              </div>

              {/* Empty state */}
              {filtered.length === 0 && (
                <div className="text-center py-20 text-[#6b6b6b]">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Không tìm thấy combo phù hợp</p>
                </div>
              )}

              {/* Pagination */}
              {total > LIMIT && (
                <div className="flex items-center justify-center gap-3 mt-10">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className={cn("px-4 py-2 rounded-lg border text-sm transition-colors",
                      page === 1 ? "border-[#e8e2d9] text-[#8b8378] cursor-not-allowed" : "border-[#e8e2d9] hover:border-[#3d5a3d] text-[#1a1a1a]"
                    )}
                  >← Trước</button>
                  <span className="text-sm text-[#6b6b6b]">Trang {page} / {Math.ceil(total / LIMIT)}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page * LIMIT >= total}
                    className={cn("px-4 py-2 rounded-lg border text-sm transition-colors",
                      page * LIMIT >= total ? "border-[#e8e2d9] text-[#8b8378] cursor-not-allowed" : "border-[#e8e2d9] hover:border-[#3d5a3d] text-[#1a1a1a]"
                    )}
                  >Sau →</button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}

function ComboCard({ combo, index }: { combo: Combo; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.05 }}>
      <Link
        href={`/combos/${combo.id}`}
        className="group flex flex-col h-full bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:border-[#3d5a3d]/40 hover:shadow-xl transition-all"
      >
        <div className="relative aspect-[16/10] overflow-hidden">
          <Image
            src={combo.cover_image || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800"}
            alt={combo.title} fill className="object-cover group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute top-3 left-3 px-3 py-1 bg-[#d4a853] text-[#1a1a1a] rounded-full text-xs font-semibold">
            Combo
          </div>
          {combo.savings_pct && combo.savings_pct > 0 && (
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-[#c4785a] text-white text-xs font-semibold">
              -{combo.savings_pct}%
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col p-5">
          <h3 className="text-lg font-semibold text-[#1a1a1a] group-hover:text-[#3d5a3d] transition-colors mb-2 line-clamp-1 tracking-tight">
            {combo.title}
          </h3>
          <p className="text-sm text-[#6b6b6b] line-clamp-2 mb-4 flex-1">{combo.description}</p>
          <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
            <div className="flex flex-col items-center p-2 bg-[#f5f0e8] rounded-lg">
              <MapPin className="w-3.5 h-3.5 text-[#3d5a3d] mb-1" />
              <span className="text-[#1a1a1a] font-medium truncate w-full text-center">{combo.destination}</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-[#f5f0e8] rounded-lg">
              <Calendar className="w-3.5 h-3.5 text-[#c4785a] mb-1" />
              <span className="text-[#1a1a1a] font-medium">{combo.num_days} ngày</span>
            </div>
            <div className="flex flex-col items-center p-2 bg-[#f5f0e8] rounded-lg">
              <Package className="w-3.5 h-3.5 text-[#d4a853] mb-1" />
              <span className="text-[#1a1a1a] font-medium">{combo.num_places} điểm</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-[#e8e2d9]">
            <div>
              <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-[#8b8378]">Tổng gói</div>
              <div className="font-mono tabular-nums text-base font-semibold text-[#3d5a3d]">{formatVnd(combo.total_cost)}</div>
            </div>
            <div className="text-xs text-[#c4785a] font-medium group-hover:translate-x-1 transition-transform">Xem chi tiết →</div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
