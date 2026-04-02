"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { ItineraryCard } from "@/components/itinerary-card";
import { trendingItineraries, destinations } from "@/lib/mock-data";
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
  const [showFilters, setShowFilters] = useState(true);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedDestination("all");
    setSelectedDuration("all");
    setSelectedBudget("all");
    setSelectedTags([]);
  };

  const filteredItineraries = trendingItineraries.filter((itinerary) => {
    if (
      searchQuery &&
      !itinerary.title.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    if (
      selectedDestination !== "all" &&
      itinerary.destination !== selectedDestination
    ) {
      return false;
    }
    if (selectedDuration !== "all") {
      if (selectedDuration === "1-3" && itinerary.duration > 3) return false;
      if (
        selectedDuration === "4-5" &&
        (itinerary.duration < 4 || itinerary.duration > 5)
      )
        return false;
      if (selectedDuration === "6+" && itinerary.duration < 6) return false;
    }
    if (selectedBudget !== "all" && itinerary.budget !== selectedBudget) {
      return false;
    }
    if (
      selectedTags.length > 0 &&
      !selectedTags.some((tag) => itinerary.tags.includes(tag))
    ) {
      return false;
    }
    return true;
  });

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero Section */}
      <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-20 overflow-hidden bg-[#3d5a3d]">
        {/* Decorative Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 border border-white rounded-full" />
          <div className="absolute bottom-10 right-20 w-48 h-48 border border-white rounded-full" />
          <div className="absolute top-1/2 right-1/4 w-20 h-20 border border-white rounded-full" />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-px bg-[#d4a853]" />
                <span className="text-sm text-[#d4a853] tracking-[0.2em] uppercase font-medium">
                  Khám phá
                </span>
              </div>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                Lịch trình
                <br />
                <span className="text-[#d4a853]">từ cộng đồng</span>
              </h1>
              <p className="text-white/70 text-lg max-w-xl mb-8">
                Tìm kiếm và khám phá những lịch trình tuyệt vời từ hàng nghìn du khách khắp Việt Nam
              </p>
              
              {/* Quick search */}
              <div className="flex items-center gap-3 p-2 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 max-w-md">
                <div className="flex-1 flex items-center gap-2 px-4">
                  <Search className="w-5 h-5 text-white/50" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm kiếm lịch trình..."
                    className="w-full bg-transparent text-white placeholder-white/50 focus:outline-none"
                  />
                </div>
                <Button className="bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] rounded-xl px-6">
                  Tìm
                </Button>
              </div>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="hidden lg:flex justify-end"
            >
              <div className="grid grid-cols-2 gap-6">
                <div className="p-6 bg-white/10 rounded-2xl border border-white/20 text-center">
                  <p className="text-4xl font-bold text-white mb-1">500+</p>
                  <p className="text-sm text-white/60">Lịch trình</p>
                </div>
                <div className="p-6 bg-white/10 rounded-2xl border border-white/20 text-center">
                  <p className="text-4xl font-bold text-white mb-1">63</p>
                  <p className="text-sm text-white/60">Tỉnh thành</p>
                </div>
                <div className="p-6 bg-white/10 rounded-2xl border border-white/20 text-center">
                  <p className="text-4xl font-bold text-white mb-1">10k+</p>
                  <p className="text-sm text-white/60">Người dùng</p>
                </div>
                <div className="p-6 bg-white/10 rounded-2xl border border-white/20 text-center">
                  <p className="text-4xl font-bold text-white mb-1">4.9</p>
                  <p className="text-sm text-white/60">Đánh giá</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-8 -mt-8">
            {/* Sidebar Filters */}
            <motion.aside
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className={cn(
                "w-full lg:w-72 shrink-0",
                showFilters ? "block" : "hidden lg:block"
              )}
            >
              <div className="sticky top-24 p-6 bg-white border border-[#e8e2d9] rounded-2xl shadow-lg">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Filter className="w-5 h-5 text-[#3d5a3d]" />
                    <h2 className="font-semibold text-[#1a1a1a]">Bộ lọc</h2>
                  </div>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-[#c4785a] hover:text-[#3d5a3d]"
                  >
                    Xóa tất cả
                  </button>
                </div>

                {/* Search */}
                <div className="mb-6">
                  <label className="block text-sm text-[#6b6b6b] mb-2">
                    Tìm kiếm
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Nhập từ khóa..."
                      className="w-full pl-10 pr-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] placeholder-[#8b8378] focus:outline-none focus:border-[#3d5a3d] transition-colors"
                    />
                  </div>
                </div>

                {/* Destination */}
                <div className="mb-6">
                  <label className="flex items-center gap-2 text-sm text-[#6b6b6b] mb-2">
                    <MapPin className="w-4 h-4" />
                    Điểm đến
                  </label>
                  <select
                    value={selectedDestination}
                    onChange={(e) => setSelectedDestination(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d] transition-colors"
                  >
                    <option value="all">Tất cả điểm đến</option>
                    {destinations.map((dest) => (
                      <option key={dest.id} value={dest.id}>
                        {dest.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Duration */}
                <div className="mb-6">
                  <label className="flex items-center gap-2 text-sm text-[#6b6b6b] mb-2">
                    <Calendar className="w-4 h-4" />
                    Thời gian
                  </label>
                  <div className="flex flex-wrap gap-2">
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

                {/* Budget */}
                <div className="mb-6">
                  <label className="flex items-center gap-2 text-sm text-[#6b6b6b] mb-2">
                    <Wallet className="w-4 h-4" />
                    Ngân sách
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {budgetOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSelectedBudget(option.value)}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full border transition-all",
                          selectedBudget === option.value
                            ? "bg-[#3d5a3d] border-[#3d5a3d] text-white"
                            : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#3d5a3d]"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="flex items-center gap-2 text-sm text-[#6b6b6b] mb-2">
                    <Tag className="w-4 h-4" />
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {tagOptions.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full border transition-all",
                          selectedTags.includes(tag)
                            ? "bg-[#c4785a] border-[#c4785a] text-white"
                            : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#c4785a]"
                        )}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.aside>

            {/* Results */}
            <div className="flex-1 pt-8">
              {/* Results Header */}
              <div className="flex items-center justify-between mb-6">
                <p className="text-[#6b6b6b]">
                  <span className="text-[#1a1a1a] font-medium">
                    {filteredItineraries.length}
                  </span>{" "}
                  lịch trình được tìm thấy
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="lg:hidden p-2 bg-white rounded-lg text-[#6b6b6b] hover:text-[#1a1a1a] border border-[#e8e2d9]"
                  >
                    <Filter className="w-5 h-5" />
                  </button>
                  <div className="flex items-center bg-white rounded-lg p-1 border border-[#e8e2d9]">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "p-2 rounded-md transition-colors",
                        viewMode === "grid"
                          ? "bg-[#3d5a3d] text-white"
                          : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                      )}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "p-2 rounded-md transition-colors",
                        viewMode === "list"
                          ? "bg-[#3d5a3d] text-white"
                          : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                      )}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Results Grid */}
              {filteredItineraries.length > 0 ? (
                <div
                  className={cn(
                    "grid gap-8",
                    viewMode === "grid"
                      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                      : "grid-cols-1"
                  )}
                >
                  {filteredItineraries.map((itinerary, index) => (
                    <ItineraryCard
                      key={itinerary.id}
                      itinerary={itinerary}
                      index={index}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <p className="text-[#6b6b6b] mb-4">
                    Không tìm thấy lịch trình phù hợp
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
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
