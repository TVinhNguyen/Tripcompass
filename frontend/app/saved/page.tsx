"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { Heart, Search, X, Loader2 } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { RequireAuth } from "@/components/require-auth"
import { apiFetch } from "@/lib/api"
import type { Place, PlaceCategory } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const CATEGORY_LABELS: Record<PlaceCategory | "all", string> = {
  all: "Tất cả",
  ATTRACTION: "Tham quan",
  FOOD: "Ăn uống",
  STAY: "Lưu trú",
}

function SavedContent() {
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<PlaceCategory | "all">("all")

  useEffect(() => {
    apiFetch<{ data: Place[] }>("/user/saved-places")
      .then(({ data }) => setPlaces(data))
      .catch(() => toast.error("Không thể tải danh sách địa điểm đã lưu."))
      .finally(() => setLoading(false))
  }, [])

  const handleUnsave = async (placeId: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== placeId))
    try {
      await apiFetch(`/user/saved-places/${placeId}`, { method: "DELETE" })
      toast.success("Đã bỏ lưu địa điểm")
    } catch {
      toast.error("Không thể bỏ lưu. Thử lại sau.")
      // Rollback by re-fetching
      apiFetch<{ data: Place[] }>("/user/saved-places")
        .then(({ data }) => setPlaces(data))
        .catch(() => {})
    }
  }

  const filtered = useMemo(() => {
    return places.filter((p) => {
      if (query && !p.name.toLowerCase().includes(query.toLowerCase())) return false
      if (category !== "all" && p.category !== category) return false
      return true
    })
  }, [places, query, category])

  const categories: (PlaceCategory | "all")[] = ["all", "ATTRACTION", "FOOD", "STAY"]

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Header */}
      <section className="pt-24 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3 mb-3">
              <Heart className="w-6 h-6 text-[#c4785a] fill-[#c4785a]" />
              <span className="text-sm text-[#6b6b6b] tracking-wider uppercase">Bộ sưu tập</span>
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl font-semibold text-[#1a1a1a] mb-2 tracking-tight leading-tight">Đã lưu</h1>
            <p className="text-[#6b6b6b]">
              <span className="text-[#1a1a1a] font-semibold">{places.length}</span> địa điểm yêu thích của bạn
            </p>
          </motion.div>
        </div>
      </section>

      {/* Filter */}
      <section className="sticky top-16 z-20 bg-[#f5f0e8]/95 backdrop-blur-md border-b border-[#e8e2d9] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm trong địa điểm đã lưu..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#e8e2d9] rounded-lg text-sm focus:outline-none focus:border-[#3d5a3d]"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "px-4 py-2 text-sm rounded-full border whitespace-nowrap transition-colors",
                    category === c
                      ? "bg-[#3d5a3d] border-[#3d5a3d] text-white"
                      : "bg-white border-[#e8e2d9] text-[#6b6b6b] hover:border-[#3d5a3d]",
                  )}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="group relative bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:border-[#3d5a3d]/40 hover:shadow-xl transition-all"
                >
                  <Link href={`/places/${p.id}`} className="block">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      {p.cover_image ? (
                        <Image
                          src={p.cover_image}
                          alt={p.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                      ) : (
                        <div className="w-full h-full bg-[#e8e2d9] flex items-center justify-center">
                          <Heart className="w-8 h-8 text-[#8b8378]" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-[#1a1a1a] line-clamp-1 mb-1">{p.name}</h3>
                      <p className="text-sm text-[#6b6b6b]">{p.area || p.destination}</p>
                    </div>
                  </Link>
                  {/* Unsave button */}
                  <button
                    onClick={() => handleUnsave(p.id)}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center hover:bg-white shadow-sm"
                    title="Bỏ lưu"
                  >
                    <Heart className="w-4 h-4 fill-[#c4785a] text-[#c4785a]" />
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white border border-[#e8e2d9] rounded-2xl">
              <div className="w-16 h-16 rounded-full bg-[#f5f0e8] flex items-center justify-center mx-auto mb-4">
                {query || category !== "all" ? <X className="w-8 h-8 text-[#8b8378]" /> : <Heart className="w-8 h-8 text-[#c4785a]" />}
              </div>
              <h3 className="text-xl font-semibold text-[#1a1a1a] mb-2 tracking-tight">
                {query || category !== "all" ? "Không tìm thấy" : "Chưa lưu địa điểm nào"}
              </h3>
              <p className="text-[#6b6b6b] mb-6">
                {query || category !== "all" ? "Thử thay đổi từ khoá" : "Khám phá và lưu những nơi bạn yêu thích"}
              </p>
              <Link href="/places">
                <Button className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white">Khám phá địa điểm</Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}

export default function SavedPage() {
  return (
    <RequireAuth>
      <SavedContent />
    </RequireAuth>
  )
}
