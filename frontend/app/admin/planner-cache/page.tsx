"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, Clock, Database, Eye, RefreshCw, Search, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"
import { AdminShell } from "@/components/admin/admin-shell"
import { apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"

type CacheStats = {
  hit_rate: number
  total_entries: number
  total_bytes: number
  tokens_saved: number
  avg_response_ms: number
  avg_ttl_seconds: number
}

type CachedQuery = {
  id: string
  key: string
  query: string
  source: string
  hits: number
  last_used: string
  size: string
  size_bytes: number
  score: number
  ttl_seconds: number
}

type CacheResponse = {
  mode: string
  redis_configured: boolean
  cache_prefix: string
  stats: CacheStats
  queries: CachedQuery[]
  planner_ai_error?: string
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return unitIndex === 0 ? `${value} ${units[unitIndex]}` : `${value.toFixed(1)} ${units[unitIndex]}`
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "N/A"
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)} phút`
  return `${(seconds / 3600).toFixed(1)} giờ`
}

function modeLabel(mode: string) {
  if (mode === "llm") return "Planner AI"
  if (mode === "go-engine") return "Go Engine"
  return mode || "N/A"
}

export default function PlannerCachePage() {
  const [search, setSearch] = useState("")
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const [queries, setQueries] = useState<CachedQuery[]>([])
  const [mode, setMode] = useState("")
  const [redisConfigured, setRedisConfigured] = useState(false)
  const [plannerAIError, setPlannerAIError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [loading, setLoading] = useState(false)
  const [flushing, setFlushing] = useState(false)

  const load = useCallback(async (showToast = false) => {
    setLoading(true)
    setLoadError("")
    try {
      const res = await apiFetch<CacheResponse>("/admin/planner/cache")
      setCacheStats(res.stats)
      setQueries(res.queries ?? [])
      setMode(res.mode)
      setRedisConfigured(res.redis_configured)
      setPlannerAIError(res.planner_ai_error ?? "")
      if (res.planner_ai_error) {
        toast.warning("Không đọc được cache từ Planner AI")
      } else if (showToast) {
        toast.success("Đã làm mới thống kê cache")
      }
    } catch {
      setCacheStats(null)
      setQueries([])
      setLoadError("Không tải được thống kê cache. Vui lòng kiểm tra backend hoặc quyền admin.")
      if (showToast) toast.error("Làm mới thất bại")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDeleteQuery = async (id: string) => {
    try {
      const res = await apiFetch<{ deleted?: number; message?: string }>(
        `/admin/planner/cache/key?key=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
      await load()
      toast.success(res.message ?? `Đã xoá ${res.deleted ?? 0} cache key`)
    } catch {
      toast.error("Xoá cache key thất bại")
    }
  }

  const handleFlushAll = async () => {
    if (!confirm("Xoá toàn bộ cache planner? Thao tác này không thể hoàn tác.")) return
    setFlushing(true)
    try {
      const res = await apiFetch<{
        deleted?: number
        go_deleted?: number
        planner_ai_deleted?: number
        planner_ai_error?: string
        message?: string
      }>("/admin/planner/cache", { method: "DELETE" })
      await load()
      if (res.planner_ai_error) {
        toast.warning(`Đã xoá cache Go, nhưng Planner AI lỗi: ${res.planner_ai_error}`)
      } else {
        toast.warning(res.message ?? `Đã xoá ${res.deleted ?? 0} cache key`)
      }
    } catch {
      toast.error("Xoá cache thất bại")
    } finally {
      setFlushing(false)
    }
  }

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return queries
    return queries.filter((q) =>
      [q.query, q.key, q.source].some((value) => value.toLowerCase().includes(keyword)),
    )
  }, [queries, search])

  const hasStats = cacheStats !== null
  const entries = cacheStats?.total_entries ?? 0
  const totalBytes = cacheStats?.total_bytes ?? 0
  const avgTTL = cacheStats?.avg_ttl_seconds ?? 0

  return (
    <AdminShell
      title="Planner Cache"
      description="Quản lý cache kết quả AI Planner để tối ưu chi phí và độ trễ"
      action={
        <div className="flex gap-2">
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[#e8e2d9] bg-white px-4 py-2 text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f0e8] disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Làm mới
          </button>
          <button
            onClick={handleFlushAll}
            disabled={flushing}
            className="inline-flex items-center gap-2 rounded-lg bg-[#c94a4a] px-4 py-2 text-sm font-medium text-white hover:bg-[#a33a3a] disabled:opacity-60"
          >
            {flushing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Xoá toàn bộ
          </button>
        </div>
      }
    >
      <div className="mb-6 rounded-2xl border border-[#d4a853]/30 bg-[#d4a853]/10 px-4 py-3 text-sm text-[#6b5a2a]">
        Trang này đọc cache thật từ backend. Hit-rate, token saving và biểu đồ theo thời gian chưa hiển thị vì hệ thống hiện chưa lưu bộ đếm hit/miss theo từng key.
      </div>

      {loadError && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#c94a4a]/30 bg-[#c94a4a]/10 px-4 py-3 text-sm text-[#8a2f2f]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {plannerAIError && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#d4a853]/40 bg-[#fff7df] px-4 py-3 text-sm text-[#6b5a2a]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Không đọc được cache Planner AI: {plannerAIError}</span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Chế độ planner", value: modeLabel(mode), icon: Zap, accent: "bg-[#3d5a3d]" },
          { label: "Tổng entries", value: hasStats ? entries.toLocaleString("vi-VN") : "N/A", icon: Database, accent: "bg-[#c4785a]" },
          { label: "Dung lượng cache", value: hasStats ? formatBytes(totalBytes) : "N/A", icon: Database, accent: "bg-[#d4a853]" },
          { label: "TTL trung bình", value: hasStats ? formatDuration(avgTTL) : "N/A", icon: Clock, accent: "bg-[#8b6f47]" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-[#e8e2d9] bg-white p-5">
            <div className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-xl text-white", s.accent)}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="font-mono text-2xl font-semibold tabular-nums text-[#1a1a1a]">{s.value}</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#8b8378]">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#e8e2d9] bg-white p-6 lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-base font-semibold tracking-tight text-[#1a1a1a]">Hit / Miss 24 giờ qua</h3>
            <p className="text-xs text-[#8b8378]">Cần tracking hit/miss trước khi vẽ biểu đồ</p>
          </div>
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-[#e8e2d9] bg-[#f5f0e8]/50 px-6 text-center">
            <p className="text-sm text-[#8b8378]">
              Dữ liệu cache entries bên dưới là dữ liệu thật. Biểu đồ hit/miss chưa bật vì backend chưa lưu time series.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e8e2d9] bg-white p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold tracking-tight text-[#1a1a1a]">Trạng thái nguồn cache</h3>
            <p className="text-xs text-[#8b8378]">Redis backend và Planner AI</p>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-[#f5f0e8] px-3 py-2">
              <span className="text-[#6b6b6b]">Backend Redis</span>
              <span className={cn("font-medium", redisConfigured ? "text-[#3d5a3d]" : "text-[#c94a4a]")}>
                {redisConfigured ? "Đã cấu hình" : "Không có"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#f5f0e8] px-3 py-2">
              <span className="text-[#6b6b6b]">Planner mode</span>
              <span className="font-medium text-[#1a1a1a]">{modeLabel(mode)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[#f5f0e8] px-3 py-2">
              <span className="text-[#6b6b6b]">Cache entries</span>
              <span className="font-mono font-medium text-[#1a1a1a]">{entries}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8e2d9] bg-white">
        <div className="flex flex-col items-start justify-between gap-3 border-b border-[#e8e2d9] p-4 md:flex-row md:items-center">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-[#1a1a1a]">Cache entries</h3>
            <p className="text-xs text-[#8b8378]">Các key cache đang tồn tại trong Redis</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b8378]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm cache key..."
              className="w-full rounded-lg border border-[#e8e2d9] bg-[#f5f0e8] py-2 pl-10 pr-4 text-sm text-[#1a1a1a] focus:border-[#3d5a3d] focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f5f0e8] text-left text-xs uppercase tracking-wider text-[#8b8378]">
                <th className="px-5 py-3 font-medium">Cache entry</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">TTL</th>
                <th className="hidden px-5 py-3 font-medium lg:table-cell">Size</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">TTL score</th>
                <th className="w-24 px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e2d9]">
              {filtered.map((q) => (
                <tr key={q.id} className="hover:bg-[#f5f0e8]/50">
                  <td className="max-w-md px-5 py-4">
                    <p className="line-clamp-2 text-[#1a1a1a]">{q.query}</p>
                    <p className="mt-1 truncate font-mono text-xs text-[#8b8378]">{q.key}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center rounded-full bg-[#d4a853]/15 px-2 py-1 text-xs font-medium text-[#8b6f47]">
                      {q.source}
                    </span>
                  </td>
                  <td className="hidden px-5 py-4 text-[#6b6b6b] md:table-cell">{formatDuration(q.ttl_seconds)}</td>
                  <td className="hidden px-5 py-4 text-[#6b6b6b] lg:table-cell">{q.size}</td>
                  <td className="hidden px-5 py-4 md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#e8e2d9]">
                        <div className="h-full bg-[#3d5a3d]" style={{ width: `${Math.round(q.score * 100)}%` }} />
                      </div>
                      <span className="text-xs text-[#6b6b6b]">{q.score.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1">
                      <button
                        onClick={() => toast.info(q.key)}
                        className="rounded-md p-1.5 text-[#6b6b6b] hover:bg-[#e8e2d9]"
                        aria-label="Xem cache key"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteQuery(q.id)}
                        className="rounded-md p-1.5 text-[#c94a4a] hover:bg-[#c94a4a]/10"
                        aria-label="Xoá cache key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#8b8378]">
                    {loading ? "Đang tải cache..." : "Chưa có cache entry. Hãy chạy Quick Planner hoặc AI Planner để sinh cache."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  )
}
