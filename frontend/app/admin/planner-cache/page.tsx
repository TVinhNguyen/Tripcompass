"use client"

import { useCallback, useEffect, useState } from "react"
import { Database, Zap, Clock, TrendingUp, Search, Trash2, RefreshCw, Eye } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type CacheStats = {
  hit_rate: number
  total_entries: number
  tokens_saved: number
  avg_response_ms: number
}

type CachedQuery = {
  id: string
  query: string
  hits: number
  last_used: string
  size: string
  score: number
}

export default function PlannerCachePage() {
  const [search, setSearch] = useState("")
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [queries, setQueries] = useState<CachedQuery[]>([])
  const [flushing, setFlushing] = useState(false)

  const load = useCallback(async () => {
    setCacheStats(null)
    setQueries([])
  }, [])

  useEffect(() => { load() }, [load])

  const handleDeleteQuery = async (id: string) => {
    toast.info(`Planner query #${id} chưa có API xoá riêng`)
  }

  const handleFlushAll = async () => {
    if (!confirm("Xoá toàn bộ cache? Không thể hoàn tác.")) return
    setFlushing(true)
    try {
      const res = await apiFetch<{ deleted?: number; message?: string }>("/admin/planner/cache", { method: "DELETE" })
      setQueries([])
      toast.warning(res.message ?? `Đã xoá ${res.deleted ?? 0} cache key`)
    } catch {
      toast.error("Xoá thất bại")
    } finally {
      setFlushing(false)
    }
  }

  const handleRefresh = async () => {
    load()
    toast.info("Thống kê cache chi tiết chưa có API production")
  }

  const hasStats = cacheStats !== null
  const hr = cacheStats?.hit_rate ?? 0
  const entries = cacheStats?.total_entries ?? 0
  const tokensSaved = cacheStats?.tokens_saved ?? 0
  const avgMs = cacheStats?.avg_response_ms ?? 0

  const filtered = search
    ? queries.filter((q) => q.query.toLowerCase().includes(search.toLowerCase()))
    : queries

  return (
    <AdminShell
      title="Planner Cache"
      description="Quản lý cache kết quả AI Planner để tối ưu chi phí và độ trễ"
      action={
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-white border border-[#e8e2d9] rounded-lg text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f0e8] inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </button>
          <button
            onClick={handleFlushAll}
            disabled={flushing}
            className="px-4 py-2 bg-[#c94a4a] text-white rounded-lg text-sm font-medium hover:bg-[#a33a3a] inline-flex items-center gap-2"
          >
            {flushing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Xoá toàn bộ
          </button>
        </div>
      }
    >
      {/* KPIs */}
      <div className="mb-6 rounded-2xl border border-[#d4a853]/30 bg-[#d4a853]/10 px-4 py-3 text-sm text-[#6b5a2a]">
        Trang này không gọi trực tiếp planner-ai nữa. Production hiện chỉ hỗ trợ xoá cache qua backend admin; thống kê/query chi tiết cần endpoint backend riêng trước khi bật lại.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Hit rate trung bình", value: hasStats ? `${hr.toFixed(1)}%` : "N/A",                                               icon: Zap,      trend: "", accent: "bg-[#3d5a3d]" },
          { label: "Tổng entries",        value: entries.toLocaleString("vi-VN"),                                                icon: Database, trend: "", accent: "bg-[#c4785a]" },
          { label: "Tokens tiết kiệm",   value: tokensSaved >= 1e6 ? `${(tokensSaved/1e6).toFixed(1)}M` : String(tokensSaved), icon: TrendingUp, trend: "", accent: "bg-[#d4a853]" },
          { label: "Avg response",        value: hasStats ? `${avgMs}ms` : "N/A",                                                       icon: Clock,    trend: "", accent: "bg-[#8b6f47]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#e8e2d9] rounded-2xl p-5">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3", s.accent)}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="font-mono tabular-nums text-2xl font-semibold text-[#1a1a1a]">{s.value}</div>
            <div className="text-[10px] tracking-[0.18em] uppercase text-[#8b8378] mt-1 font-medium">{s.label}</div>
            <div className="text-xs text-[#3d5a3d] mt-1.5 font-medium">{s.trend}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-white border border-[#e8e2d9] rounded-2xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#1a1a1a] tracking-tight">Hit / Miss 24 giờ qua</h3>
            <p className="text-xs text-[#8b8378]">Tỉ lệ trúng cache theo giờ</p>
          </div>
          <div className="h-64 rounded-xl border border-dashed border-[#e8e2d9] bg-[#f5f0e8]/50 flex items-center justify-center px-6 text-center">
            <p className="text-sm text-[#8b8378]">
              Chưa có endpoint thống kê hit/miss theo giờ. Không hiển thị dữ liệu giả trong production.
            </p>
          </div>
        </div>

        <div className="bg-white border border-[#e8e2d9] rounded-2xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#1a1a1a] tracking-tight">Tokens tiết kiệm / tuần</h3>
            <p className="text-xs text-[#8b8378]">Nhờ cache hit</p>
          </div>
          <div className="h-64 rounded-xl border border-dashed border-[#e8e2d9] bg-[#f5f0e8]/50 flex items-center justify-center px-6 text-center">
            <p className="text-sm text-[#8b8378]">
              Cần backend trả time series trước khi bật biểu đồ token saving.
            </p>
          </div>
        </div>
      </div>

      {/* Cached queries */}
      <div className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 p-4 border-b border-[#e8e2d9]">
          <div>
            <h3 className="text-base font-semibold text-[#1a1a1a] tracking-tight">Top cached queries</h3>
            <p className="text-xs text-[#8b8378]">Câu hỏi được cache và dùng nhiều nhất</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm query..."
              className="w-full pl-10 pr-4 py-2 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f0e8] text-left text-xs uppercase tracking-wider text-[#8b8378]">
                <th className="px-5 py-3 font-medium">Query</th>
                <th className="px-5 py-3 font-medium">Hits</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Score</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Size</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Dùng lần cuối</th>
                <th className="px-5 py-3 font-medium w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e2d9]">
              {filtered.map((q) => (
                <tr key={q.id} className="hover:bg-[#f5f0e8]/50">
                  <td className="px-5 py-4 max-w-md">
                    <p className="text-[#1a1a1a] line-clamp-2">{q.query}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-[#d4a853]/15 text-[#8b6f47] text-xs font-medium">
                      {q.hits}×
                    </span>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#e8e2d9] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#3d5a3d]"
                          style={{ width: `${q.score * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#6b6b6b]">{q.score.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-[#6b6b6b]">{q.size}</td>
                  <td className="px-5 py-4 hidden md:table-cell text-[#6b6b6b]">{q.last_used}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      <button
                        onClick={() => toast.info(`Preview query #${q.id}`)}
                        className="p-1.5 rounded-md hover:bg-[#e8e2d9] text-[#6b6b6b]"
                        aria-label="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteQuery(q.id)}
                        className="p-1.5 rounded-md hover:bg-[#c94a4a]/10 text-[#c94a4a]"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  )
}
