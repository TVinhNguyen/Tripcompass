"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { ItineraryCard } from "@/components/itinerary-card";
const DESTINATIONS = [
  { id: "da-nang",   name: "Đà Nẵng" },
  { id: "hoi-an",    name: "Hội An" },
  { id: "da-lat",    name: "Đà Lạt" },
  { id: "nha-trang", name: "Nha Trang" },
  { id: "ha-noi",    name: "Hà Nội" },
  { id: "sapa",      name: "Sapa" },
  { id: "phu-quoc",  name: "Phú Quốc" },
  { id: "ha-long",   name: "Vịnh Hạ Long" },
];
import { apiFetch } from "@/lib/api";
import type { Itinerary, PaginatedList } from "@/lib/types";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDestination, setSelectedDestination] = useState("all");
  const [selectedDuration, setSelectedDuration] = useState("all");
  const [selectedBudget, setSelectedBudget] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchItineraries = useCallback(async () => {
    setLoading(true)
    try {
      const q: Record<string, string | number | undefined> = {
        status: "PUBLISHED",
        limit: 12,
        page,
        ...(searchQuery              ? { q: searchQuery }                     : {}),
        ...(selectedDestination !== "all" ? { destination: selectedDestination } : {}),
        ...(selectedBudget !== "all"     ? { budget_category: selectedBudget.toUpperCase() } : {}),
        ...(selectedTags.length         ? { tags: selectedTags.join(",") }     : {}),
      }
      const res = await apiFetch<PaginatedList<Itinerary>>("/itineraries", { query: q, auth: false })
      setItineraries(res.data || [])
      setTotal(res.total || 0)
    } catch {
      setItineraries([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery, selectedDestination, selectedBudget, selectedTags, page])

  useEffect(() => { fetchItineraries() }, [fetchItineraries])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setPage(1);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedDestination("all");
    setSelectedDuration("all");
    setSelectedBudget("all");
    setSelectedTags([]);
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
            <div className="flex items-center gap-2 p-1.5 bg-white/5 border border-white/10 rounded-full max-w-2xl backdrop-blur-sm">
              <div className="flex-1 flex items-center gap-2 px-4">
                <Search className="w-5 h-5 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Bạn muốn đi đâu?"
                  className="w-full bg-transparent text-white placeholder-white/40 py-2.5 outline-none"
                />
              </div>
              <Button className="bg-[#d4a853] hover:bg-[#c4985a] text-[#1a1a1a] rounded-full px-6 font-semibold">
                Tìm kiếm
              </Button>
            </div>

            {/* Quick stats row */}
            <div className="flex flex-wrap items-center gap-8 mt-10 text-white/70">
              <div>
                <p className="text-2xl font-bold text-white">500+</p>
                <p className="text-xs text-white/50">Lịch trình</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <p className="text-2xl font-bold text-white">63</p>
                <p className="text-xs text-white/50">Tỉnh thành</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <p className="text-2xl font-bold text-white">10k+</p>
                <p className="text-xs text-white/50">Người dùng</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div>
                <p className="text-2xl font-bold text-white">4.9</p>
                <p className="text-xs text-white/50">Đánh giá</p>
              </div>
            </div>
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
                onClick={() => setSelectedDestination("all")}
                className={cn(
                  "px-3.5 py-2 text-sm rounded-full border transition-all whitespace-nowrap",
                  selectedDestination === "all"
                    ? "bg-[#1a1a1a] border-[#1a1a1a] text-white"
                    : "bg-white border-[#e8e2d9] text-[#6b6b6b] hover:border-[#1a1a1a]"
                )}
              >
                Tất cả
              </button>
              {DESTINATIONS.slice(0, 6).map((dest) => (
                <button
                  key={dest.id}
                  onClick={() => setSelectedDestination(dest.id)}
                  className={cn(
                    "px-3.5 py-2 text-sm rounded-full border transition-all whitespace-nowrap",
                    selectedDestination === dest.id
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
                          onClick={() => setSelectedDuration(option.value)}
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
                          onClick={() => setSelectedBudget(option.value)}
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
                      onChange={(e) => setSelectedDestination(e.target.value)}
                      className="w-full px-3 py-2 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d] transition-colors"
                    >
                      <option value="all">Tất cả điểm đến</option>
                      {DESTINATIONS.map((dest) => (
                        <option key={dest.id} value={dest.id}>
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
