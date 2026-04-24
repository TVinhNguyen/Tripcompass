"use client"

import Link from "next/link"
import Image from "next/image"
import {
  TrendingUp,
  Users,
  MapPin,
  Package,
  ArrowUpRight,
  Activity,
  Sparkles,
  Eye,
  Plus,
} from "lucide-react"
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
} from "recharts"
import { AdminShell } from "@/components/admin/admin-shell"
import { apiFetch } from "@/lib/api"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

// Fallback static data shown while API is loading or in dev without backend
const FALLBACK_TRAFFIC = [
  { day: "T2", visits: 4200, signups: 240 },
  { day: "T3", visits: 5100, signups: 312 },
  { day: "T4", visits: 4800, signups: 290 },
  { day: "T5", visits: 6200, signups: 420 },
  { day: "T6", visits: 7400, signups: 510 },
  { day: "T7", visits: 9100, signups: 680 },
  { day: "CN", visits: 8400, signups: 590 },
]

const FALLBACK_DESTINATIONS = [
  { name: "Đà Nẵng", trips: 420 },
  { name: "Hà Nội", trips: 380 },
  { name: "Hội An", trips: 340 },
  { name: "Sài Gòn", trips: 310 },
  { name: "Phú Quốc", trips: 285 },
  { name: "Sapa", trips: 240 },
]

type AdminStats = {
  total_users: number
  total_itineraries: number
  total_places: number
  ai_requests_week: number
  cache_hit_rate: number
  avg_response_ms: number
  tokens_saved: number
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
  const trafficData = FALLBACK_TRAFFIC
  const topDestinations = FALLBACK_DESTINATIONS

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

  const stats = [
    { label: "Người dùng",  value: adminStats ? nf(adminStats.total_users)        : "—", delta: "", icon: Users,    accent: "bg-[#3d5a3d]" },
    { label: "Lịch trình", value: adminStats ? nf(adminStats.total_itineraries)   : "—", delta: "", icon: MapPin,   accent: "bg-[#c4785a]" },
    { label: "Địa điểm",   value: adminStats ? nf(adminStats.total_places)       : "—", delta: "", icon: Package,  accent: "bg-[#d4a853]" },
    { label: "AI Requests", value: adminStats ? nf(adminStats.ai_requests_week)  : "—", delta: "", icon: Sparkles, accent: "bg-[#8b6f47]" },
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
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-[#e8e2d9] rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white", s.accent)}>
                <s.icon className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[#3d5a3d] bg-[#3d5a3d]/10 px-2 py-1 rounded-full">
                <TrendingUp className="w-3 h-3" />
                {s.delta}
              </span>
            </div>
            <div className="font-mono tabular-nums text-2xl font-semibold text-[#1a1a1a]">{s.value}</div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#8b8378] mt-1 font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Traffic chart */}
        <div className="lg:col-span-2 bg-white border border-[#e8e2d9] rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#1a1a1a] tracking-tight">Lưu lượng tuần này</h3>
              <p className="text-xs text-[#8b8378]">Lượt truy cập và đăng ký mới theo ngày</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3d5a3d]" />
                Lượt truy cập
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#d4a853]" />
                Đăng ký
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trafficData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d9" vertical={false} />
                <XAxis dataKey="day" stroke="#8b8378" fontSize={12} />
                <YAxis stroke="#8b8378" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e8e2d9",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line type="monotone" dataKey="visits" stroke="#3d5a3d" strokeWidth={2.5} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="signups" stroke="#d4a853" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top destinations */}
        <div className="bg-white border border-[#e8e2d9] rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-[#1a1a1a] tracking-tight">Điểm đến hot</h3>
              <p className="text-xs text-[#8b8378]">Theo số lịch trình tạo</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDestinations} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e2d9" horizontal={false} />
                <XAxis type="number" stroke="#8b8378" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#1a1a1a" fontSize={11} width={70} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e8e2d9",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="trips" fill="#c4785a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
                <Image
                  src={a.avatar}
                  alt={a.user}
                  width={36}
                  height={36}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1a1a1a] truncate">
                    <span className="font-medium">{a.user}</span>{" "}
                    <span className="text-[#8b8378]">{a.action}</span>
                    {a.item && <span className="text-[#1a1a1a]"> · {a.item}</span>}
                  </p>
                  <p className="text-xs text-[#8b8378]">{a.time}</p>
                </div>
                <Activity className="w-4 h-4 text-[#8b8378] flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-gradient-to-br from-[#1a1a1a] to-[#3d5a3d] text-white rounded-2xl p-6">
          <Sparkles className="w-8 h-8 text-[#d4a853] mb-4" />
          <h3 className="text-lg font-semibold mb-2 tracking-tight">AI Planner đang hoạt động tốt</h3>
          <p className="text-sm text-white/70 mb-4">
            Hit rate cache tuần này đạt 87%. Tối ưu chi phí AI.
          </p>
          <div className="space-y-3 pt-4 border-t border-white/10">
            {[
              { label: "Cache hit rate", value: "87%" },
              { label: "Avg response time", value: "1.2s" },
              { label: "Tokens tiết kiệm", value: "2.4M" },
            ].map((m) => (
              <div key={m.label} className="flex items-center justify-between text-sm">
                <span className="text-white/60">{m.label}</span>
                <span className="font-medium text-[#d4a853]">{m.value}</span>
              </div>
            ))}
          </div>
          <Link
            href="/admin/planner-cache"
            className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 bg-[#d4a853] text-[#1a1a1a] rounded-lg text-sm font-medium hover:bg-[#c49843]"
          >
            Xem chi tiết
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </AdminShell>
  )
}
