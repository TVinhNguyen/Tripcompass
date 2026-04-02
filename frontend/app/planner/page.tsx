"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { trendingItineraries } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Grid3X3,
  List,
  Calendar,
  Eye,
  Heart,
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  FileText,
  Send,
  ArrowRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "draft" | "published";

export default function PlannerPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Mock user itineraries (combining with status)
  const userItineraries = trendingItineraries.map((item, index) => ({
    ...item,
    status: index % 2 === 0 ? ("published" as const) : ("draft" as const),
  }));

  const filteredItineraries = userItineraries.filter((item) =>
    statusFilter === "all" ? true : item.status === statusFilter
  );

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Header Section */}
      <section className="pt-24 pb-8 lg:pt-32 lg:pb-12 bg-[#1a1a1a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-px bg-[#d4a853]" />
                <span className="text-sm text-[#d4a853] tracking-[0.15em] uppercase font-medium">
                  Dashboard
                </span>
              </div>
              <h1 className="font-serif text-3xl lg:text-5xl font-bold text-white mb-3">
                Lịch trình
                <br />
                <span className="text-[#d4a853]">cua toi</span>
              </h1>
              <p className="text-white/50">
                Quan ly va chinh sua cac lich trinh du lich cua ban
              </p>
            </div>

            <Button
              asChild
              className="bg-[#c4785a] hover:bg-[#b36a4e] text-white border-0 shadow-lg px-6 py-6"
            >
              <Link href="/itinerary/new/edit">
                <Plus className="w-5 h-5 mr-2" />
                Tao lich trinh moi
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Filters & View Toggle */}
      <section className="py-6 bg-white border-b border-[#e8e2d9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              {(["all", "published", "draft"] as StatusFilter[]).map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "px-4 py-2 text-sm rounded-full border-2 transition-all font-medium",
                      statusFilter === status
                        ? "bg-[#3d5a3d] border-[#3d5a3d] text-white"
                        : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#3d5a3d]"
                    )}
                  >
                    {status === "all"
                      ? "Tất cả"
                      : status === "published"
                        ? "Đã xuất bản"
                        : "Bản nháp"}
                  </button>
                )
              )}
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-[#6b6b6b]">
                {filteredItineraries.length} lich trinh
              </span>
              <div className="flex items-center bg-[#f5f0e8] rounded-lg p-1 border border-[#e8e2d9]">
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
        </div>
      </section>

      {/* Itineraries Grid/List */}
      <section className="py-10 lg:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredItineraries.map((itinerary, index) => (
                <motion.div
                  key={itinerary.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="group relative bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:shadow-xl hover:border-[#3d5a3d]/30 transition-all"
                >
                  {/* Cover Image */}
                  <div className="relative h-48 overflow-hidden">
                    <Image
                      src={itinerary.coverImage}
                      alt={itinerary.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/80 to-transparent" />

                    {/* Status Badge */}
                    <div
                      className={cn(
                        "absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-medium",
                        itinerary.status === "published"
                          ? "bg-[#3d5a3d] text-white"
                          : "bg-[#d4a853] text-[#1a1a1a]"
                      )}
                    >
                      {itinerary.status === "published"
                        ? "Đã xuất bản"
                        : "Bản nháp"}
                    </div>

                    {/* Actions Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="absolute top-4 right-4 p-2 bg-white/90 backdrop-blur-sm rounded-full text-[#1a1a1a] hover:bg-white shadow-sm">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-white border-[#e8e2d9]"
                      >
                        <DropdownMenuItem className="text-[#1a1a1a] hover:bg-[#f5f0e8] cursor-pointer">
                          <Edit3 className="w-4 h-4 mr-2" />
                          Chỉnh sửa
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-[#1a1a1a] hover:bg-[#f5f0e8] cursor-pointer">
                          <Copy className="w-4 h-4 mr-2" />
                          Nhân bản
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-[#1a1a1a] hover:bg-[#f5f0e8] cursor-pointer">
                          <Send className="w-4 h-4 mr-2" />
                          Chia sẻ
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-[#c4785a] hover:bg-[#c4785a]/10 cursor-pointer">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Xóa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Duration Badge */}
                    <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium text-[#1a1a1a]">
                      <Calendar className="w-4 h-4 text-[#3d5a3d]" />
                      {itinerary.duration} ngay
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <Link href={`/itinerary/${itinerary.id}`}>
                      <h3 className="font-serif text-lg font-bold text-[#1a1a1a] mb-2 hover:text-[#3d5a3d] transition-colors line-clamp-2">
                        {itinerary.title}
                      </h3>
                    </Link>

                    <div className="flex items-center gap-4 text-sm text-[#6b6b6b] mb-4">
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-4 h-4" />
                        <span>{itinerary.views}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Heart className="w-4 h-4" />
                        <span>{itinerary.likes}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="flex-1 border-[#e8e2d9] text-[#1a1a1a] hover:bg-[#f5f0e8] hover:border-[#3d5a3d]"
                      >
                        <Link href={`/itinerary/${itinerary.id}`}>
                          <Eye className="w-4 h-4 mr-2" />
                          Xem
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        className="flex-1 bg-[#3d5a3d] text-white hover:bg-[#2d4a2d] border-0"
                      >
                        <Link href={`/itinerary/${itinerary.id}/edit`}>
                          <Edit3 className="w-4 h-4 mr-2" />
                          Sua
                        </Link>
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredItineraries.map((itinerary, index) => (
                <motion.div
                  key={itinerary.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white border border-[#e8e2d9] rounded-2xl hover:shadow-lg hover:border-[#3d5a3d]/30 transition-all"
                >
                  {/* Thumbnail */}
                  <div className="relative w-full sm:w-32 h-24 sm:h-20 rounded-xl overflow-hidden shrink-0">
                    <Image
                      src={itinerary.coverImage}
                      alt={itinerary.title}
                      fill
                      className="object-cover"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          itinerary.status === "published"
                            ? "bg-[#3d5a3d]/10 text-[#3d5a3d]"
                            : "bg-[#d4a853]/20 text-[#d4a853]"
                        )}
                      >
                        {itinerary.status === "published" ? "Đã xuất bản" : "Nhap"}
                      </div>
                    </div>
                    <Link href={`/itinerary/${itinerary.id}`}>
                      <h3 className="font-serif font-bold text-[#1a1a1a] hover:text-[#3d5a3d] transition-colors truncate">
                        {itinerary.title}
                      </h3>
                    </Link>
                    <div className="flex items-center gap-4 text-sm text-[#6b6b6b] mt-1">
                      <span>{itinerary.duration} ngay</span>
                      <span>{itinerary.views} luot xem</span>
                      <span>{itinerary.likes} yeu thich</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="border-[#e8e2d9] text-[#1a1a1a] hover:bg-[#f5f0e8]"
                    >
                      <Link href={`/itinerary/${itinerary.id}`}>
                        <Eye className="w-4 h-4" />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      className="bg-[#3d5a3d] text-white hover:bg-[#2d4a2d]"
                    >
                      <Link href={`/itinerary/${itinerary.id}/edit`}>
                        <Edit3 className="w-4 h-4" />
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f5f0e8] rounded-lg">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-white border-[#e8e2d9]"
                      >
                        <DropdownMenuItem className="text-[#1a1a1a] hover:bg-[#f5f0e8] cursor-pointer">
                          <Copy className="w-4 h-4 mr-2" />
                          Nhân bản
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-[#1a1a1a] hover:bg-[#f5f0e8] cursor-pointer">
                          <Send className="w-4 h-4 mr-2" />
                          Chia sẻ
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-[#c4785a] hover:bg-[#c4785a]/10 cursor-pointer">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Xóa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {filteredItineraries.length === 0 && (
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-6 bg-[#f5f0e8] rounded-full flex items-center justify-center">
                <FileText className="w-10 h-10 text-[#c4785a]" />
              </div>
              <h3 className="font-serif text-xl font-bold text-[#1a1a1a] mb-2">Chua co lich trinh nao</h3>
              <p className="text-[#6b6b6b] mb-6">Bat dau tao lich trinh dau tien cua ban</p>
              <Button
                asChild
                className="bg-[#c4785a] hover:bg-[#b36a4e] text-white"
              >
                <Link href="/itinerary/new/edit">
                  <Plus className="w-5 h-5 mr-2" />
                  Tao lich trinh dau tien
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
