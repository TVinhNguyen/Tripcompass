"use client"

import Link from "next/link"
import Image from "next/image"
import {
  Users,
  MapPin,
  Package,
  ArrowUpRight,
  Activity,
  Sparkles,
  Eye,
  Plus,
} from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { apiFetch } from "@/lib/api"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

// Traffic chart + top-destinations BarChart are intentionally NOT populated
// from fake data — backend does not yet expose those aggregations and showing
// fabricated visits/signups misleads stakeholders. The two cards render an
// empty-state until /admin/traffic and /admin/destinations endpoints exist.

type AdminStats = {
  total_users: number
  total_itineraries: number
  total_places: number
  ai_requests_week: number
}

type RecentActivity = {
  user: string
  action: string
  item: string
  time: string
  avatar: string
}

export default function AdminDashboardPage() {
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])

  useEffect(() => {
    // GET /admin/stats — non-blocking, falls back gracefully
    apiFetch<AdminStats>("/admin/stats")
      .then(setAdminStats)
      .catch(() => { /* keep null, show fallback */ })

    apiFetch<{ data: RecentActivity[] }>("/admin/activity?limit=5")
      .then((r) => setRecentActivity(r.data ?? []))
      .catch(() => { /* keep empty */ })
  }, [])

  const nf = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  // ISO → "5 phút trước" — keep tiny here; if reused, lift to lib/format.
  const formatRelative = (iso: string): string => {
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return iso
    const diff = Math.max(0, Date.now() - t)
    const m = Math.floor(diff / 60_000)
    if (m < 1)  return "vừa xong"
    if (m < 60) return `${m} phút trước`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} giờ trước`
    const d = Math.floor(h / 24)
    if (d < 7)  return `${d} ngày trước`
    return new Date(iso).toLocaleDateString("vi-VN")
  }

  const stats = [
    { label: "Người dùng",  value: adminStats ? nf(adminStats.total_users)      : "—", icon: Users,    accent: "bg-[#3d5a3d]" },
    { label: "Lịch trình", value: adminStats ? nf(adminStats.total_itineraries) : "—", icon: MapPin,   accent: "bg-[#c4785a]" },
    { label: "Địa điểm",   value: adminStats ? nf(adminStats.total_places)     : "—", icon: Package,  accent: "bg-[#d4a853]" },
    { label: "AI Requests", value: adminStats ? nf(adminStats.ai_requests_week): "—", icon: Sparkles, accent: "bg-[#8b6f47]" },
  ]
  return (
    <AdminShell
      title="Tổng quan"
      description="Chào mừng quay lại, đây là những gì đang diễn ra trên TripCompass"
      action={
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-white border border-[#e8e2d9] rounded-lg text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f0e8] inline-flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Xem báo cáo
          </button>
          <Link
            href="/admin/places"
            className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#3d5a3d] inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Thêm địa điểm
          </Link>
        </div>
      }
    >
      {/* Stats grid — delta badge bị bỏ vì chưa có dữ liệu time-series để so sánh */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-[#e8e2d9] rounded-2xl p-5">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3", s.accent)}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-semibold text-[#1a1a1a]">{s.value}</div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#8b8378] mt-1 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Traffic chart — endpoint chưa có */}
        <div className="lg:col-span-2 bg-white border border-[#e8e2d9] rounded-2xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#1a1a1a] tracking-tight">Lưu lượng tuần này</h3>
            <p className="text-xs text-[#8b8378]">Lượt truy cập và đăng ký mới theo ngày</p>
          </div>
          <div className="h-64 rounded-xl border border-dashed border-[#e8e2d9] bg-[#f5f0e8]/50 flex items-center justify-center px-6 text-center">
            <p className="text-sm text-[#8b8378]">Chưa có dữ liệu traffic — cần endpoint analytics riêng.</p>
          </div>
        </div>

        {/* Top destinations — endpoint chưa có */}
        <div className="bg-white border border-[#e8e2d9] rounded-2xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#1a1a1a] tracking-tight">Điểm đến hot</h3>
            <p className="text-xs text-[#8b8378]">Theo số lịch trình tạo</p>
          </div>
          <div className="h-64 rounded-xl border border-dashed border-[#e8e2d9] bg-[#f5f0e8]/50 flex items-center justify-center px-6 text-center">
            <p className="text-sm text-[#8b8378]">Chờ aggregation top destinations từ backend.</p>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-[#e8e2d9] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#1a1a1a] tracking-tight">Hoạt động gần đây</h3>
              <p className="text-xs text-[#8b8378]">Cập nhật real-time</p>
            </div>
            <Link href="#" className="text-xs text-[#3d5a3d] hover:underline inline-flex items-center gap-1">
              Xem tất cả
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-[#e8e2d9]">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                {a.avatar ? (
                  <Image
                    src={a.avatar}
                    alt={a.user}
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full flex-shrink-0 bg-[#3d5a3d]/10 text-[#3d5a3d] font-semibold inline-flex items-center justify-center text-sm">
                    {a.user.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1a1a1a] truncate">
                    <span className="font-medium">{a.user}</span>{" "}
                    <span className="text-[#8b8378]">{a.action}</span>
                    {a.item && <span className="text-[#1a1a1a]"> · {a.item}</span>}
                  </p>
                  <p className="text-xs text-[#8b8378]">{formatRelative(a.time)}</p>
                </div>
                <Activity className="w-4 h-4 text-[#8b8378] flex-shrink-0" />
              </div>
            ))}
            {recentActivity.length === 0 && (
              <div className="py-8 text-center text-sm text-[#8b8378]">Chưa có hoạt động nào.</div>
            )}
          </div>
        </div>

        {/* Planner cache shortcut — KPIs ẩn cho tới khi planner-ai expose
            stats endpoint. Trang chi tiết hiện chỉ flush được, đã honest. */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#3d5a3d] text-white rounded-2xl p-6 flex flex-col">
          <Sparkles className="w-8 h-8 text-[#d4a853] mb-4" />
          <h3 className="text-lg font-semibold mb-2 tracking-tight">Planner Cache</h3>
          <p className="text-sm text-white/70 mb-4">
            Quản lý cache câu trả lời AI để tối ưu chi phí và độ trễ. Số liệu chi tiết sẽ hiển thị khi backend cung cấp endpoint thống kê.
          </p>
          <Link
            href="/admin/planner-cache"
            className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 bg-[#d4a853] text-[#1a1a1a] rounded-lg text-sm font-medium hover:bg-[#c49843]"
          >
            Mở trang quản lý
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </AdminShell>
  )
}
