"use client";

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { ItineraryCard } from "@/components/itinerary-card";
import { apiFetch } from "@/lib/api";
import type { DestinationStat, Itinerary, PaginatedList } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Search,
  Filter,
  MapPin,
  Calendar,
  Wallet,
  Tag,
  Grid3X3,
  List,
  X,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const durationOptions = [
  { value: "all", label: "Tất cả" },
  { value: "1-3", label: "1-3 ngày" },
  { value: "4-5", label: "4-5 ngày" },
  { value: "6+", label: "6+ ngày" },
];

const budgetOptions = [
  { value: "all", label: "Tất cả" },
  { value: "budget", label: "Tiết kiệm" },
  { value: "moderate", label: "Vừa phải" },
  { value: "luxury", label: "Sang trọng" },
];

const tagOptions = [
  "beach",
  "culture",
  "food",
  "nature",
  "romantic",
  "trekking",
  "photography",
  "luxury",
];

export default function ExplorePage() {
  // searchInput = giá trị đang gõ; searchQuery = giá trị đã commit (Enter / nút Tìm)
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDestination, setSelectedDestination] = useState("all");
  const [selectedDuration, setSelectedDuration] = useState("all");
  const [selectedBudget, setSelectedBudget] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState("created_at");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [destinations, setDestinations] = useState<DestinationStat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 12;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    const durationQuery =
      selectedDuration === "1-3" ? { min_days: 1, max_days: 3 } :
      selectedDuration === "4-5" ? { min_days: 4, max_days: 5 } :
      selectedDuration === "6+"  ? { min_days: 6 } :
      {}
    const query: Record<string, string | number | undefined> = {
      limit,
      page,
      sort,
      ...durationQuery,
      ...(searchQuery                   ? { q: searchQuery }                                 : {}),
      ...(selectedDestination !== "all" ? { destination: selectedDestination }               : {}),
      ...(selectedBudget !== "all"      ? { budget_category: selectedBudget.toUpperCase() }  : {}),
      ...(selectedTags.length            ? { tags: selectedTags.join(",") }                   : {}),
    }
    apiFetch<PaginatedList<Itinerary>>("/explore", { query, auth: false, signal: ctrl.signal })
      .then((res) => {
        setItineraries(res.data || [])
        setTotal(res.total || 0)
      })
      .catch((err) => {
        if (err?.name === "AbortError") return
        setItineraries([])
        setTotal(0)
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [searchQuery, selectedDestination, selectedBudget, selectedDuration, selectedTags, sort, page, limit])

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

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearchQuery("");
    setSelectedDestination("all");
    setSelectedDuration("all");
    setSelectedBudget("all");
    setSelectedTags([]);
    setSort("created_at");
    setPage(1);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
    setPage(1);
  };

  const activeFilterCount =
    (selectedDestination !== "all" ? 1 : 0) +
    (selectedDuration !== "all" ? 1 : 0) +
    (selectedBudget !== "all" ? 1 : 0) +
    selectedTags.length;

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero Section - unified with landing's charcoal+image style */}
      <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-20 overflow-hidden bg-[#1a1a1a]">
        {/* Background Image */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1528127269322-539801943592?w=1920&q=80')",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/85 to-[#1a1a1a]/70" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a] via-[#1a1a1a]/70 to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-px bg-[#d4a853]" />
              <span className="text-xs text-[#d4a853] tracking-[0.2em] uppercase font-semibold">
                Khám phá cộng đồng
              </span>
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold text-white mb-5 leading-[1.05] tracking-tight">
              Lịch trình
              <br />
              <span className="text-[#d4a853]">từ cộng đồng</span>
            </h1>
            <p className="text-white/60 text-base lg:text-lg max-w-xl mb-8 leading-relaxed">
              Tìm kiếm và khám phá những lịch trình tuyệt vời từ hàng nghìn du khách khắp Việt Nam.
            </p>

            {/* Search bar */}
            <form onSubmit={submitSearch} className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-full max-w-2xl backdrop-blur-sm">
              <div className="flex-1 flex items-center gap-2 px-4">
                <Search className="w-5 h-5 text-white/40" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Bạn muốn đi đâu?"
                  className="w-full bg-transparent text-white placeholder-white/40 py-2.5 outline-none"
                />
              </div>
              <Button type="submit" className="bg-[#d4a853] hover:bg-[#c4985a] text-[#1a1a1a] rounded-full px-6 font-semibold">
                Tìm kiếm
              </Button>
            </form>
          </motion.div>
        </div>
      </section>

      {/* Filter bar - sticky below hero */}
      <section className="sticky top-16 z-30 bg-[#f5f0e8]/90 backdrop-blur-md border-b border-[#e8e2d9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e8e2d9] rounded-full text-sm font-medium text-[#1a1a1a] hover:border-[#3d5a3d] transition-colors"
            >
              <Filter className="w-4 h-4" />
              <span>Bộ lọc</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 bg-[#3d5a3d] text-white text-xs font-semibold rounded-full">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform",
                  showFilters && "rotate-180"
                )}
              />
            </button>

            {/* Quick destination chips */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => { setSelectedDestination("all"); setPage(1) }}
                className={cn(
                  "px-3.5 py-2 text-sm rounded-full border transition-all whitespace-nowrap",
                  selectedDestination === "all"
                    ? "bg-[#1a1a1a] border-[#1a1a1a] text-white"
                    : "bg-white border-[#e8e2d9] text-[#6b6b6b] hover:border-[#1a1a1a]"
                )}
              >
                Tất cả
              </button>
              {destinations.slice(0, 6).map((dest) => (
                <button
                  key={dest.slug || dest.name}
                  onClick={() => { setSelectedDestination(dest.name); setPage(1) }}
                  className={cn(
                    "px-3.5 py-2 text-sm rounded-full border transition-all whitespace-nowrap",
                    selectedDestination === dest.name
                      ? "bg-[#1a1a1a] border-[#1a1a1a] text-white"
                      : "bg-white border-[#e8e2d9] text-[#6b6b6b] hover:border-[#1a1a1a]"
                  )}
                >
                  {dest.name}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm text-[#6b6b6b] hidden sm:block">
                <span className="font-semibold text-[#1a1a1a]">{total}</span> kết quả
              </span>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1) }}
                className="hidden md:block px-3 py-2 bg-white border border-[#e8e2d9] rounded-full text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                aria-label="Sắp xếp lịch trình"
              >
                <option value="created_at">Mới nhất</option>
                <option value="popular">Xem nhiều</option>
                <option value="clone">Clone nhiều</option>
                <option value="rating">Đánh giá cao</option>
              </select>
              <div className="flex items-center bg-white rounded-full p-1 border border-[#e8e2d9]">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-full transition-colors",
                    viewMode === "grid"
                      ? "bg-[#1a1a1a] text-white"
                      : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                  )}
                  aria-label="Grid view"
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-1.5 rounded-full transition-colors",
                    viewMode === "list"
                      ? "bg-[#1a1a1a] text-white"
                      : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                  )}
                  aria-label="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Expanded filters panel */}
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 p-5 bg-white border border-[#e8e2d9] rounded-2xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-5">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-3">
                      <Calendar className="w-3.5 h-3.5" />
                      Thời gian
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {durationOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => { setSelectedDuration(option.value); setPage(1) }}
                          className={cn(
                            "px-3 py-1.5 text-sm rounded-full border transition-all",
                            selectedDuration === option.value
                              ? "bg-[#3d5a3d] border-[#3d5a3d] text-white"
                              : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#3d5a3d]"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-3">
                      <Wallet className="w-3.5 h-3.5" />
                      Ngân sách
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {budgetOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => { setSelectedBudget(option.value); setPage(1) }}
                          className={cn(
                            "px-3 py-1.5 text-sm rounded-full border transition-all",
                            selectedBudget === option.value
                              ? "bg-[#c4785a] border-[#c4785a] text-white"
                              : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#c4785a]"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-3">
                      <MapPin className="w-3.5 h-3.5" />
                      Điểm đến
                    </label>
                    <select
                      value={selectedDestination}
                      onChange={(e) => { setSelectedDestination(e.target.value); setPage(1) }}
                      className="w-full px-3 py-2 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d] transition-colors"
                    >
                      <option value="all">Tất cả điểm đến</option>
                      {destinations.map((dest) => (
                        <option key={dest.slug || dest.name} value={dest.name}>
                          {dest.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-3">
                    <Tag className="w-3.5 h-3.5" />
                    Chủ đề
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {tagOptions.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full border transition-all",
                          selectedTags.includes(tag)
                            ? "bg-[#d4a853] border-[#d4a853] text-[#1a1a1a] font-medium"
                            : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#d4a853]"
                        )}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <div className="flex justify-end mt-5 pt-5 border-t border-[#e8e2d9]">
                    <button
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1.5 text-sm text-[#c4785a] hover:text-[#3d5a3d] font-medium"
                    >
                      <X className="w-4 h-4" />
                      Xóa tất cả bộ lọc
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="py-10 lg:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
            </div>
          ) : itineraries.length > 0 ? (
            <>
              <div
                className={cn(
                  "grid gap-6 lg:gap-8",
                  viewMode === "grid"
                    ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                    : "grid-cols-1 max-w-4xl mx-auto"
                )}
              >
                {itineraries.map((itinerary, index) => (
                  <ItineraryCard
                    key={itinerary.id}
                    itinerary={itinerary}
                    index={index}
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
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-6 bg-white border border-[#e8e2d9] rounded-full flex items-center justify-center">
                <Search className="w-8 h-8 text-[#8b8378]" />
              </div>
              <h3 className="text-xl font-semibold text-[#1a1a1a] mb-2 tracking-tight">
                Không tìm thấy lịch trình phù hợp
              </h3>
              <p className="text-[#6b6b6b] mb-6">
                Thử thay đổi bộ lọc để tìm được lịch trình phù hợp hơn
              </p>
              <Button
                onClick={clearFilters}
                variant="outline"
                className="border-[#3d5a3d] text-[#3d5a3d] hover:bg-[#3d5a3d] hover:text-white"
              >
                Xóa bộ lọc
              </Button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
