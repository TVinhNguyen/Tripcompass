"use client"

import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { Search, Grid3X3, List, Map, X, ChevronDown } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { PlaceCard } from "@/components/place-card"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"
import PlacesMapDynamic from "@/components/places-map-dynamic"
import type { DestinationStat, Place, PlaceCategory, PaginatedList } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useSavedPlaces } from "@/hooks/use-saved-places"

const CATEGORIES: { id: PlaceCategory | "all"; label: string }[] = [
  { id: "all",        label: "Tất cả" },
  { id: "ATTRACTION", label: "Tham quan" },
  { id: "FOOD",       label: "Ăn uống" },
  { id: "STAY",       label: "Lưu trú" },
]

export default function PlacesPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list" | "map">("grid")
  // searchInput = giá trị đang gõ; searchQuery = giá trị đã commit (Enter / nút Tìm)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCity, setSelectedCity] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory | "all">("all")
  const [minRating, setMinRating] = useState(0)
  const [sort, setSort] = useState("priority")
  const [showFilters, setShowFilters] = useState(true)
  const [places, setPlaces] = useState<Place[]>([])
  const [destinations, setDestinations] = useState<DestinationStat[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const { savedIds, setPlaceSaved } = useSavedPlaces()
  const limit = viewMode === "map" ? 100 : 18
  const pageCount = Math.max(1, Math.ceil(total / limit))

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    apiFetch<PaginatedList<Place>>("/places", {
      auth: false,
      signal: ctrl.signal,
      query: {
        page,
        limit,
        sort,
        ...(searchQuery                   ? { q: searchQuery }                   : {}),
        ...(selectedCity !== "all"        ? { destination: selectedCity }        : {}),
        ...(selectedCategory !== "all"    ? { category: selectedCategory }       : {}),
        ...(minRating > 0                 ? { min_rating: minRating }            : {}),
      },
    })
      .then((res) => {
        setPlaces(res.data || [])
        setTotal(res.total || 0)
      })
      .catch((err) => {
        // Ignore aborts triggered by stale-effect cleanup.
        if (err?.name === "AbortError") return
        setPlaces([])
        setTotal(0)
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [searchQuery, selectedCity, selectedCategory, minRating, sort, page, limit])

  useEffect(() => {
    const ctrl = new AbortController()
    apiFetch<{ data: DestinationStat[] }>("/places/destinations", {
      auth: false,
      signal: ctrl.signal,
    })
      .then((res) => setDestinations(res.data || []))
      .catch((err) => {
        if (err?.name !== "AbortError") setDestinations([])
      })
    return () => ctrl.abort()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [viewMode])

  const resetFilters = () => {
    setSelectedCity("all")
    setSelectedCategory("all")
    setMinRating(0)
    setSort("priority")
    setSearchInput("")
    setSearchQuery("")
    setPage(1)
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  const placesWithCoords = places.filter((place) => place.latitude && place.longitude)
  const mapCapped = viewMode === "map" && total > limit

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero */}
      <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-20 overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1528181304800-259b08848526?w=1920"
            alt="Vietnam places"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a]/95 via-[#1a1a1a]/75 to-[#1a1a1a]/40" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-px bg-[#d4a853]" />
              <span className="text-sm text-[#d4a853] tracking-[0.2em] uppercase">Địa điểm</span>
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold text-white mb-6 leading-tight tracking-tight">
              Khám phá
              <br />
              <span className="text-[#d4a853]">địa điểm tuyệt vời</span>
            </h1>
            <p className="text-white/70 text-lg mb-8">
              Hàng nghìn quán ăn, điểm tham quan và nơi lưu trú được tuyển chọn khắp Việt Nam
            </p>
            <form onSubmit={submitSearch} className="flex items-center gap-2 p-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 max-w-xl">
              <Search className="w-5 h-5 text-white/50 ml-3" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm quán ăn, điểm tham quan, resort..."
                className="flex-1 bg-transparent text-white placeholder-white/50 focus:outline-none py-2"
              />
              <Button type="submit" className="bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] rounded-xl px-6">Tìm</Button>
            </form>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="py-10 lg:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar */}
            <aside className={cn("lg:w-72 shrink-0", showFilters ? "block" : "hidden lg:block")}>
              <div className="sticky top-24 bg-white border border-[#e8e2d9] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[11px] font-mono tracking-[0.24em] uppercase font-semibold text-[#1a1a1a]">Bộ lọc</h2>
                  <button
                    onClick={resetFilters}
                    className="text-sm text-[#c4785a] hover:text-[#3d5a3d]"
                  >
                    Đặt lại
                  </button>
                </div>

                {/* City */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Thành phố</label>
                  <div className="relative">
                    <select
                      value={selectedCity}
                      onChange={(e) => { setSelectedCity(e.target.value); setPage(1) }}
                      className="w-full appearance-none px-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                    >
                      <option value="all">Tất cả thành phố</option>
                      {destinations.map((destination) => (
                        <option key={destination.slug || destination.name} value={destination.name}>
                          {destination.name} ({destination.count})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378] pointer-events-none" />
                  </div>
                </div>

                {/* Category */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Loại địa điểm</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCategory(c.id); setPage(1) }}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full border transition-colors",
                          selectedCategory === c.id
                            ? "bg-[#3d5a3d] border-[#3d5a3d] text-white"
                            : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#3d5a3d]",
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rating */}
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Đánh giá tối thiểu</label>
                  <div className="flex flex-wrap gap-2">
                    {[0, 3, 4, 4.5].map((r) => (
                      <button
                        key={r}
                        onClick={() => { setMinRating(r); setPage(1) }}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full border transition-colors",
                          minRating === r
                            ? "bg-[#d4a853] border-[#d4a853] text-[#1a1a1a]"
                            : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#d4a853]",
                        )}
                      >
                        {r === 0 ? "Tất cả" : `${r}+ sao`}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={resetFilters} className="w-full mt-4 text-sm text-[#c4785a] hover:text-[#3d5a3d]">Xóa bộ lọc</button>
              </div>
            </aside>

            {/* Results */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <p className="text-[#6b6b6b]">
                  <span className="text-[#1a1a1a] font-semibold">{places.length}</span> / {total} địa điểm
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={sort}
                    onChange={(e) => { setSort(e.target.value); setPage(1) }}
                    className="hidden sm:block px-3 py-2 bg-white border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                    aria-label="Sắp xếp địa điểm"
                  >
                    <option value="priority">Đề xuất</option>
                    <option value="popular">Phổ biến</option>
                    <option value="rating">Đánh giá cao</option>
                    <option value="name">A-Z</option>
                  </select>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="lg:hidden px-3 py-2 bg-white border border-[#e8e2d9] rounded-lg text-sm"
                  >
                    Bộ lọc
                  </button>
                  <div className="flex items-center bg-white border border-[#e8e2d9] rounded-lg p-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "p-2 rounded-md transition-colors",
                        viewMode === "grid" ? "bg-[#3d5a3d] text-white" : "text-[#6b6b6b]",
                      )}
                      aria-label="Dạng lưới"
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "p-2 rounded-md transition-colors",
                        viewMode === "list" ? "bg-[#3d5a3d] text-white" : "text-[#6b6b6b]",
                      )}
                      aria-label="Dạng danh sách"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("map")}
                      className={cn(
                        "p-2 rounded-md transition-colors",
                        viewMode === "map" ? "bg-[#3d5a3d] text-white" : "text-[#6b6b6b]",
                      )}
                      aria-label="Dạng bản đồ"
                    >
                      <Map className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden animate-pulse">
                      <div className="h-48 bg-[#e8e2d9]" />
                      <div className="p-4 space-y-2">
                        <div className="h-4 bg-[#e8e2d9] rounded w-3/4" />
                        <div className="h-3 bg-[#e8e2d9] rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : viewMode === "map" ? (
                <>
                  {mapCapped && (
                    <p className="mb-3 text-sm text-[#c4785a]">
                      Bản đồ chỉ hiển thị tối đa {limit} địa điểm trên tổng {total}. Hãy thu hẹp bộ lọc (thành phố / loại / từ khoá) để xem đầy đủ.
                    </p>
                  )}
                  {placesWithCoords.length < places.length && (
                    <p className="mb-3 text-sm text-[#8b8378]">
                      {places.length - placesWithCoords.length}/{places.length} địa điểm chưa có tọa độ nên không hiển thị trên bản đồ.
                    </p>
                  )}
                  <div className="h-[600px] rounded-2xl overflow-hidden border border-[#e8e2d9]">
                    <PlacesMapDynamic places={placesWithCoords} />
                  </div>
                </>
              ) : places.length > 0 ? (
                <>
                  <div
                    className={cn(
                      "grid gap-6",
                      viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-1",
                    )}
                  >
                    {places.map((place, i) => (
                      <PlaceCard
                        key={place.id}
                        place={place}
                        index={i}
                        variant={viewMode}
                        initialSaved={savedIds.has(place.id)}
                        onSavedChange={(nextPlace, saved) => setPlaceSaved(nextPlace.id, saved, nextPlace)}
                      />
                    ))}
                  </div>
                  {pageCount > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        disabled={page <= 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        Trước
                      </Button>
                      <span className="px-3 text-sm text-[#6b6b6b]">
                        Trang <span className="font-semibold text-[#1a1a1a]">{page}</span> / {pageCount}
                      </span>
                      <Button
                        variant="outline"
                        disabled={page >= pageCount}
                        onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                      >
                        Sau
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-20 bg-white border border-[#e8e2d9] rounded-2xl">
                  <div className="w-16 h-16 rounded-full bg-[#f5f0e8] flex items-center justify-center mx-auto mb-4">
                    <X className="w-8 h-8 text-[#8b8378]" />
                  </div>
                  <h3 className="text-xl font-semibold text-[#1a1a1a] mb-2 tracking-tight">Không tìm thấy địa điểm</h3>
                  <p className="text-[#6b6b6b]">Thử điều chỉnh bộ lọc hoặc từ khoá tìm kiếm</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
