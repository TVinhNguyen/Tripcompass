"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { RequireAuth } from "@/components/require-auth";
import { apiFetch } from "@/lib/api";
import type { Itinerary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "DRAFT" | "PUBLISHED";

const nf = new Intl.NumberFormat("vi-VN");

function PlannerContent() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Itinerary[] }>("/itineraries");
      setItineraries(res.data ?? []);
    } catch {
      toast.error("Không thể tải lịch trình");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Xóa lịch trình này?")) return;
    try {
      setItineraries((prev) => prev.filter((i) => i.id !== id));
      await apiFetch(`/itineraries/${id}`, { method: "DELETE" });
      toast.success("Đã xóa lịch trình");
    } catch {
      toast.error("Xóa thất bại");
      load();
    }
  };

  const handleClone = async (id: string) => {
    try {
      const cloned = await apiFetch<Itinerary>(`/itineraries/${id}/clone`, { method: "POST" });
      setItineraries((prev) => [cloned, ...prev]);
      toast.success("Đã nhân bản lịch trình");
    } catch {
      toast.error("Nhân bản thất bại");
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const updated = await apiFetch<Itinerary>(`/itineraries/${id}/publish`, { method: "PATCH" });
      setItineraries((prev) => prev.map((i) => (i.id === id ? updated : i)));
      toast.success("Đã xuất bản lịch trình");
    } catch {
      toast.error("Xuất bản thất bại");
    }
  };

  const handleShare = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/itinerary/${id}/public`);
    toast.success("Đã sao chép link chia sẻ");
  };

  const filtered = itineraries.filter((i) =>
    statusFilter === "all" ? true : i.status === statusFilter
  );

  const stats = {
    total: itineraries.length,
    published: itineraries.filter((i) => i.status === "PUBLISHED").length,
    drafts: itineraries.filter((i) => i.status === "DRAFT").length,
    totalViews: itineraries.reduce((s, i) => s + (i.view_count ?? 0), 0),
  };

  const getDuration = (it: Itinerary) => {
    const start = new Date(it.start_date);
    const end = new Date(it.end_date);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  };

  const cover = (it: Itinerary) =>
    it.cover_image_url ||
    "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800";

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Header */}
      <section className="pt-24 pb-10 lg:pt-32 lg:pb-16 bg-[#1a1a1a] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#d4a853] rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8"
          >
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-px bg-[#d4a853]" />
                <span className="text-xs text-[#d4a853] tracking-[0.2em] uppercase font-semibold">
                  Bảng điều khiển
                </span>
              </div>
              <h1 className="font-serif text-4xl lg:text-5xl font-semibold text-white mb-3 leading-tight tracking-tight">
                Lịch trình<br />
                <span className="text-[#d4a853]">của tôi</span>
              </h1>
              <p className="text-white/60 max-w-lg">
                Quản lý và chỉnh sửa các lịch trình du lịch của bạn.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 lg:gap-4">
              <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
                <p className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-white">{stats.total}</p>
                <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-1">Tổng số</p>
              </div>
              <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
                <p className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-[#d4a853]">{stats.published}</p>
                <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-1">Xuất bản</p>
              </div>
              <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl">
                <p className="font-mono tabular-nums text-2xl lg:text-3xl font-semibold text-white">
                  {stats.totalViews >= 1000 ? `${(stats.totalViews / 1000).toFixed(1)}k` : stats.totalViews}
                </p>
                <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-1">Lượt xem</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Action Bar */}
      <section className="sticky top-16 z-30 bg-[#f5f0e8]/90 backdrop-blur-md border-b border-[#e8e2d9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {([
                { value: "all"       as StatusFilter, label: "Tất cả",     count: stats.total },
                { value: "PUBLISHED" as StatusFilter, label: "Đã xuất bản", count: stats.published },
                { value: "DRAFT"     as StatusFilter, label: "Bản nháp",   count: stats.drafts },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 text-sm rounded-full border transition-all font-medium whitespace-nowrap",
                    statusFilter === opt.value
                      ? "bg-[#1a1a1a] border-[#1a1a1a] text-white"
                      : "bg-white border-[#e8e2d9] text-[#6b6b6b] hover:border-[#1a1a1a]"
                  )}
                >
                  <span>{opt.label}</span>
                  <span className={cn(
                    "px-1.5 text-xs rounded-full",
                    statusFilter === opt.value ? "bg-white/20 text-white" : "bg-[#f5f0e8] text-[#8b8378]"
                  )}>{opt.count}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white rounded-full p-1 border border-[#e8e2d9]">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn("p-1.5 rounded-full transition-colors", viewMode === "grid" ? "bg-[#1a1a1a] text-white" : "text-[#6b6b6b] hover:text-[#1a1a1a]")}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn("p-1.5 rounded-full transition-colors", viewMode === "list" ? "bg-[#1a1a1a] text-white" : "text-[#6b6b6b] hover:text-[#1a1a1a]")}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <Button asChild className="bg-[#c4785a] hover:bg-[#b36a4e] text-white border-0 rounded-full shadow-sm">
                <Link href="/itinerary/new">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Tạo lịch trình
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-10 lg:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {filtered.map((it, index) => (
                <motion.article
                  key={it.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.04 }}
                  className="group relative bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <Image src={cover(it)} alt={it.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/70 via-transparent to-transparent" />
                    <div className={cn(
                      "absolute top-4 left-4 px-2.5 py-1 rounded-full text-xs font-semibold",
                      it.status === "PUBLISHED" ? "bg-[#3d5a3d] text-white" : "bg-[#d4a853] text-[#1a1a1a]"
                    )}>
                      {it.status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="absolute top-4 right-4 p-2 bg-white/95 backdrop-blur-sm rounded-full text-[#1a1a1a] hover:bg-white shadow-sm">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white border-[#e8e2d9]">
                        <DropdownMenuItem asChild>
                          <Link href={`/itinerary/${it.id}/edit`} className="text-[#1a1a1a] cursor-pointer">
                            <Edit3 className="w-4 h-4 mr-2" />Chỉnh sửa
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleClone(it.id)} className="text-[#1a1a1a] cursor-pointer">
                          <Copy className="w-4 h-4 mr-2" />Nhân bản
                        </DropdownMenuItem>
                        {it.status === "PUBLISHED" && (
                          <DropdownMenuItem onClick={() => handleShare(it.id)} className="text-[#1a1a1a] cursor-pointer">
                            <Send className="w-4 h-4 mr-2" />Sao chép link
                          </DropdownMenuItem>
                        )}
                        {it.status === "DRAFT" && (
                          <DropdownMenuItem onClick={() => handlePublish(it.id)} className="text-[#3d5a3d] cursor-pointer">
                            <Send className="w-4 h-4 mr-2" />Xuất bản
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDelete(it.id)} className="text-[#c4785a] cursor-pointer">
                          <Trash2 className="w-4 h-4 mr-2" />Xóa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="absolute bottom-4 left-4 flex items-center gap-1.5 px-2.5 py-1 bg-white/95 backdrop-blur-sm rounded-full text-xs font-semibold text-[#1a1a1a]">
                      <Calendar className="w-3.5 h-3.5 text-[#3d5a3d]" />
                      <span>{getDuration(it)} ngày</span>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <Link href={`/itinerary/${it.id}`}>
                      <h3 className="text-base font-semibold text-[#1a1a1a] mb-2 hover:text-[#3d5a3d] transition-colors line-clamp-2 tracking-tight leading-snug">{it.title}</h3>
                    </Link>
                    <div className="flex items-center gap-4 text-sm text-[#8b8378] mb-4">
                      <div className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /><span>{nf.format(it.view_count)}</span></div>
                      <div className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 text-[#c4785a]" /><span>{it.clone_count}</span></div>
                    </div>
                    <div className="flex items-center gap-2 mt-auto">
                      <Button asChild size="sm" variant="outline" className="flex-1 border-[#e8e2d9] text-[#1a1a1a] hover:bg-[#f5f0e8] hover:border-[#3d5a3d]">
                        <Link href={`/itinerary/${it.id}`}><Eye className="w-4 h-4 mr-1.5" />Xem</Link>
                      </Button>
                      <Button asChild size="sm" className="flex-1 bg-[#3d5a3d] text-white hover:bg-[#2d4a2d] border-0">
                        <Link href={`/itinerary/${it.id}/edit`}><Edit3 className="w-4 h-4 mr-1.5" />Chỉnh sửa</Link>
                      </Button>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          ) : (
            <div className="space-y-3 max-w-4xl mx-auto">
              {filtered.map((it, index) => (
                <motion.div
                  key={it.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                  className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-white border border-[#e8e2d9] rounded-2xl hover:shadow-md hover:border-[#3d5a3d]/30 transition-all"
                >
                  <div className="relative w-full sm:w-36 aspect-[4/3] sm:aspect-square rounded-xl overflow-hidden shrink-0">
                    <Image src={cover(it)} alt={it.title} fill className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
                        it.status === "PUBLISHED" ? "bg-[#3d5a3d]/10 text-[#3d5a3d]" : "bg-[#d4a853]/20 text-[#a8872a]"
                      )}>
                        {it.status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"}
                      </span>
                    </div>
                    <Link href={`/itinerary/${it.id}`}>
                      <h3 className="text-base font-semibold text-[#1a1a1a] hover:text-[#3d5a3d] transition-colors truncate tracking-tight">{it.title}</h3>
                    </Link>
                    <div className="flex items-center gap-4 text-sm text-[#8b8378] mt-1">
                      <span>{getDuration(it)} ngày · {it.destination}</span>
                      <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{nf.format(it.view_count)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button asChild size="sm" variant="outline" className="border-[#e8e2d9] text-[#1a1a1a] hover:bg-[#f5f0e8]">
                      <Link href={`/itinerary/${it.id}`}><Eye className="w-4 h-4" /></Link>
                    </Button>
                    <Button asChild size="sm" className="bg-[#3d5a3d] text-white hover:bg-[#2d4a2d]">
                      <Link href={`/itinerary/${it.id}/edit`}><Edit3 className="w-4 h-4" /></Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f5f0e8] rounded-lg">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white border-[#e8e2d9]">
                        <DropdownMenuItem onClick={() => handleClone(it.id)} className="text-[#1a1a1a] cursor-pointer">
                          <Copy className="w-4 h-4 mr-2" />Nhân bản
                        </DropdownMenuItem>
                        {it.status === "DRAFT" && (
                          <DropdownMenuItem onClick={() => handlePublish(it.id)} className="text-[#3d5a3d] cursor-pointer">
                            <Send className="w-4 h-4 mr-2" />Xuất bản
                          </DropdownMenuItem>
                        )}
                        {it.status === "PUBLISHED" && (
                          <DropdownMenuItem onClick={() => handleShare(it.id)} className="text-[#1a1a1a] cursor-pointer">
                            <Send className="w-4 h-4 mr-2" />Sao chép link
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDelete(it.id)} className="text-[#c4785a] cursor-pointer">
                          <Trash2 className="w-4 h-4 mr-2" />Xóa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-20">
              <div className="w-20 h-20 mx-auto mb-6 bg-white border border-[#e8e2d9] rounded-full flex items-center justify-center">
                <FileText className="w-9 h-9 text-[#c4785a]" />
              </div>
              <h3 className="text-xl font-semibold text-[#1a1a1a] mb-2 tracking-tight">
                {statusFilter === "all" ? "Chưa có lịch trình nào" : "Không có lịch trình nào"}
              </h3>
              <p className="text-[#6b6b6b] mb-6">
                {statusFilter === "all" ? "Bắt đầu tạo lịch trình đầu tiên của bạn ngay hôm nay" : "Thử chọn bộ lọc khác"}
              </p>
              <Button asChild className="bg-[#c4785a] hover:bg-[#b36a4e] text-white rounded-full">
                <Link href="/itinerary/new">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Tạo lịch trình đầu tiên
                  <ArrowRight className="w-4 h-4 ml-1.5" />
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

export default function PlannerPage() {
  return (
    <RequireAuth>
      <PlannerContent />
    </RequireAuth>
  );
}
