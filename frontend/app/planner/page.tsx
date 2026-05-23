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
  MoreVertical,
  Edit3,
  Trash2,
  Copy,
  FileText,
  Send,
  ArrowRight,
  Loader2,
  Sparkles,
  Wand2,
  X,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { OnboardingTour, type TourStep } from "@/components/onboarding-tour";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "DRAFT" | "PUBLISHED";


function PlannerContent() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [loading, setLoading] = useState(true);

  // Onboarding panel for first-time users — shown when their list is still
  // empty AND they haven't dismissed it before. Keyed by user.id so a shared
  // browser (rare for this app) still respects each account.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    if (typeof window === "undefined") return;
    const key = `tripcompass_onboarding_seen_${user.id}`;
    setShowWelcome(window.localStorage.getItem(key) !== "1");
  }, [user?.id]);

  const dismissWelcome = useCallback(() => {
    if (!user?.id || typeof window === "undefined") return;
    window.localStorage.setItem(`tripcompass_onboarding_seen_${user.id}`, "1");
    setShowWelcome(false);
  }, [user?.id]);

  // Replay tour — used by the welcome panel link. Clears both flags so the
  // spotlight tour runs again immediately. Forces the OnboardingTour
  // component to remount via a counter key so it re-reads its storage gate.
  const [tourReplay, setTourReplay] = useState(0);
  const replayTour = useCallback(() => {
    if (!user?.id || typeof window === "undefined") return;
    window.localStorage.removeItem(`tour_planner_${user.id}`);
    setTourReplay((n) => n + 1);
  }, [user?.id]);

  // Tour steps for new-user onboarding on /planner. Targets are stable
  // data-tour anchors on the three CTA cards + the nav "Hướng dẫn" link.
  const tourSteps: TourStep[] = [
    {
      target: '[data-tour="planner-ai-chat"]',
      title: "Trợ lý AI",
      body: "Mô tả chuyến đi bằng câu tự nhiên, AI sẽ hỏi lại và lên kế hoạch. Phù hợp khi chưa rõ điểm đến hoặc muốn brainstorm.",
    },
    {
      target: '[data-tour="planner-quick"]',
      title: "Tạo nhanh",
      body: "Đã biết điểm đến rồi? Điền form ngắn (ngày, ngân sách, sở thích) và để AI sắp xếp ngay.",
    },
    {
      target: '[data-tour="planner-manual"]',
      title: "Tự tạo",
      body: "Bắt đầu từ lịch trình rỗng nếu bạn muốn kiểm soát chi tiết — kéo thả hoạt động theo ý.",
    },
    {
      target: '[data-tour="nav-help"]',
      title: "Trung tâm hỗ trợ",
      body: "Khi bí, mở Hướng dẫn để xem cách dùng từng phần. Có thể quay lại tour này bằng nút Xem hướng dẫn từng bước.",
      preferredPlacement: "bottom",
    },
  ];

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
      const updated = await apiFetch<Itinerary>(`/itineraries/${id}/publish`, {
        method: "PATCH",
        body: { status: "PUBLISHED" },
      });
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
                      <div className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /><span>{it.view_count.toLocaleString("vi-VN")}</span></div>
                      <div className="flex items-center gap-1"><Copy className="w-3.5 h-3.5 text-[#c4785a]" /><span>{it.clone_count}</span></div>
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
                      <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{it.view_count.toLocaleString("vi-VN")}</span>
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

          {/* Empty State — also surfaces the onboarding choices for new users */}
          {!loading && filtered.length === 0 && (
            <div className="py-12">
              {/* Filter-empty branch ONLY fires when the user actually has
                  itineraries but the current filter hides them. A new account
                  (itineraries.length === 0) still sees onboarding even if
                  they happen to click a filter chip out of curiosity. */}
              {itineraries.length > 0 && statusFilter !== "all" ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 mx-auto mb-6 bg-white border border-[#e8e2d9] rounded-full flex items-center justify-center">
                    <FileText className="w-9 h-9 text-[#c4785a]" />
                  </div>
                  <h3 className="text-xl font-semibold text-[#1a1a1a] mb-2 tracking-tight">
                    Không có lịch trình nào
                  </h3>
                  <p className="text-[#6b6b6b]">Thử chọn bộ lọc khác.</p>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl">
                  {/* Dismissable welcome panel — coach card, not a blocking modal */}
                  {showWelcome && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative mb-8 overflow-hidden rounded-2xl border border-[#3d5a3d]/20 bg-gradient-to-br from-[#3d5a3d] to-[#2d4a2d] p-6 text-white"
                    >
                      <button
                        type="button"
                        onClick={dismissWelcome}
                        aria-label="Đóng hướng dẫn"
                        className="absolute right-3 top-3 rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#d4a853] text-[#1a1a1a]">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 pr-6">
                          <h2 className="font-serif text-xl font-semibold tracking-tight">
                            Chào mừng đến TripCompass
                          </h2>
                          <p className="mt-2 text-sm leading-relaxed text-white/80">
                            Bạn có ba cách bắt đầu chuyến đi đầu tiên. Chọn cái thoải mái nhất —
                            có thể đổi giữa chừng bất cứ lúc nào.
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                            <button
                              type="button"
                              onClick={replayTour}
                              className="inline-flex items-center gap-1.5 font-medium text-[#d4a853] transition-colors hover:text-[#c49843]"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              Xem hướng dẫn từng bước
                            </button>
                            <Link
                              href="/help/quickstart"
                              className="inline-flex items-center gap-1.5 font-medium text-white/70 transition-colors hover:text-white"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              Đọc bài hướng dẫn
                            </Link>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* 3 CTAs — equal weight, user picks the entry point */}
                  <div className="text-center">
                    <h3 className="font-serif text-2xl font-semibold tracking-tight text-[#1a1a1a]">
                      Tạo lịch trình đầu tiên
                    </h3>
                    <p className="mt-2 text-sm text-[#6b6b6b]">
                      Chọn cách phù hợp với bạn — kết quả đều là một lịch trình có thể chỉnh sửa.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-3">
                    <Link
                      href="/ai-planner"
                      data-tour="planner-ai-chat"
                      className="group flex flex-col rounded-2xl border border-[#e8e2d9] bg-white p-5 transition-all hover:border-[#3d5a3d]/40 hover:shadow-md"
                    >
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#3d5a3d]/10 text-[#3d5a3d]">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <h4 className="text-base font-semibold tracking-tight text-[#1a1a1a]">
                        Trợ lý AI
                      </h4>
                      <p className="mt-1 flex-1 text-xs leading-relaxed text-[#6b6b6b]">
                        Mô tả chuyến đi bằng câu tự nhiên, AI lo phần còn lại.
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#3d5a3d]">
                        Mở Chat
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>

                    <Link
                      href="/ai-planner/quick"
                      data-tour="planner-quick"
                      className="group flex flex-col rounded-2xl border border-[#e8e2d9] bg-white p-5 transition-all hover:border-[#c4785a]/40 hover:shadow-md"
                    >
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#c4785a]/10 text-[#c4785a]">
                        <Wand2 className="h-5 w-5" />
                      </div>
                      <h4 className="text-base font-semibold tracking-tight text-[#1a1a1a]">
                        Tạo nhanh
                      </h4>
                      <p className="mt-1 flex-1 text-xs leading-relaxed text-[#6b6b6b]">
                        Điền form ngắn: điểm đến, ngày, ngân sách. AI tự sắp xếp.
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#c4785a]">
                        Mở form
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>

                    <Link
                      href="/itinerary/new"
                      data-tour="planner-manual"
                      className="group flex flex-col rounded-2xl border border-[#e8e2d9] bg-white p-5 transition-all hover:border-[#d4a853]/40 hover:shadow-md"
                    >
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#d4a853]/15 text-[#8b6f47]">
                        <Plus className="h-5 w-5" />
                      </div>
                      <h4 className="text-base font-semibold tracking-tight text-[#1a1a1a]">
                        Tự tạo
                      </h4>
                      <p className="mt-1 flex-1 text-xs leading-relaxed text-[#6b6b6b]">
                        Bắt đầu lịch trình rỗng, kéo thả hoạt động theo ý.
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#8b6f47]">
                        Bắt đầu
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />

      {/* New-user guided tour. Auto-starts once when a logged-in user lands
          on /planner with no itineraries — replay link in the welcome panel
          clears the seen flag and remounts via `tourReplay` key. */}
      {user?.id && (
        <OnboardingTour
          key={tourReplay}
          steps={tourSteps}
          storageKey={`tour_planner_${user.id}`}
          enabled={!loading && itineraries.length === 0}
        />
      )}
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
