"use client"

import { useCallback, useEffect, useState } from "react"
import { Brain, FileText, Upload, Search, Plus, MoreVertical, Trash2, Edit2, Eye, FileCheck2, FileClock, Link as LinkIcon, Loader2, RefreshCw } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const PLANNER_AI = process.env.NEXT_PUBLIC_PLANNER_AI_URL ?? ""

type KBDoc = {
  id: string
  title: string
  type: string
  size: string
  chunks: number
  status: "indexed" | "indexing" | "failed"
  updatedAt: string
}

type KBSource = {
  id: string
  name: string
  url: string
  pages: number
  lastCrawl: string
}

const statusStyles: Record<string, string> = {
  indexed: "bg-[#3d5a3d]/10 text-[#3d5a3d]",
  indexing: "bg-[#d4a853]/10 text-[#8b6f47]",
  failed: "bg-[#c94a4a]/10 text-[#c94a4a]",
}

const statusLabel: Record<string, string> = {
  indexed: "Đã index",
  indexing: "Đang xử lý",
  failed: "Thất bại",
}

export default function KnowledgeBasePage() {
  const [tab, setTab] = useState<"docs" | "sources">("docs")
  const [search, setSearch] = useState("")
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [docs, setDocs] = useState<KBDoc[]>([])
  const [sources, setSources] = useState<KBSource[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [docsRes, sourcesRes] = await Promise.allSettled([
        fetch(`${PLANNER_AI}/knowledge/documents`).then((r) => r.json()),
        fetch(`${PLANNER_AI}/knowledge/sources`).then((r) => r.json()),
      ])
      if (docsRes.status === "fulfilled") setDocs(docsRes.value?.data ?? docsRes.value ?? [])
      if (sourcesRes.status === "fulfilled") setSources(sourcesRes.value?.data ?? sourcesRes.value ?? [])
    } catch {
      // Planner-AI may not be running locally
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    try {
      setDocs((prev) => prev.filter((d) => d.id !== id))
      await fetch(`${PLANNER_AI}/knowledge/documents/${id}`, { method: "DELETE" })
      toast.success("Đã xoá tài liệu")
    } catch {
      toast.error("Xoá thất bại")
      load()
    } finally {
      setMenuOpen(null)
    }
  }

  const handleReindex = async (id: string) => {
    try {
      await fetch(`${PLANNER_AI}/knowledge/documents/${id}/reindex`, { method: "POST" })
      toast.success("Đã gửi yêu cầu tái index")
    } catch {
      toast.error("Tái index thất bại")
    } finally {
      setMenuOpen(null)
    }
  }

  const handleCrawl = async (id: string, name: string) => {
    try {
      await fetch(`${PLANNER_AI}/knowledge/sources/${id}/crawl`, { method: "POST" })
      toast.success(`Đang quét ${name}...`)
    } catch {
      toast.error("Quét thất bại")
    }
  }

  const filteredDocs = docs.filter((d) => !search || d.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <AdminShell
      title="Knowledge Base"
      description="Tài liệu và nguồn kiến thức cho AI Planner"
      action={
        <div className="flex gap-2">
          <button
            onClick={() => toast.info("Upload modal sẽ mở")}
            className="px-4 py-2 bg-white border border-[#e8e2d9] rounded-lg text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f0e8] inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Tải lên
          </button>
          <button
            onClick={load}
            className="px-4 py-2 bg-white border border-[#e8e2d9] rounded-lg text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f0e8] inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Làm mới
          </button>
          <button
            onClick={() => toast.info("Thêm nguồn mới")}
            className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#3d5a3d] inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Thêm nguồn
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Tổng tài liệu", value: docs.length, icon: FileText, accent: "bg-[#3d5a3d]" },
              { label: "Đã index", value: docs.filter((d) => d.status === "indexed").length, icon: FileCheck2, accent: "bg-[#c4785a]" },
              { label: "Tổng chunks", value: docs.reduce((s, d) => s + d.chunks, 0).toLocaleString("vi-VN"), icon: Brain, accent: "bg-[#d4a853]" },
              { label: "Nguồn kiến thức", value: sources.length, icon: LinkIcon, accent: "bg-[#8b6f47]" },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-[#e8e2d9] rounded-2xl p-5 flex items-center gap-4">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white", s.accent)}>
                  <s.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-mono tabular-nums text-xl font-semibold text-[#1a1a1a]">{s.value}</div>
                  <div className="text-xs text-[#8b8378]">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 border-b border-[#e8e2d9]">
              <div className="flex gap-1">
                {[
                  { id: "docs", label: "Tài liệu", icon: FileText },
                  { id: "sources", label: "Nguồn web", icon: LinkIcon },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id as "docs" | "sources")}
                    className={cn(
                      "px-4 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-2 -mb-px",
                      tab === t.id
                        ? "text-[#1a1a1a] border-[#1a1a1a]"
                        : "text-[#8b8378] border-transparent hover:text-[#1a1a1a]",
                    )}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="relative w-64 mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm..."
                  className="w-full pl-10 pr-4 py-1.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                />
              </div>
            </div>

            {tab === "docs" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#f5f0e8] text-left text-xs uppercase tracking-wider text-[#8b8378]">
                      <th className="px-5 py-3 font-medium">Tài liệu</th>
                      <th className="px-5 py-3 font-medium hidden md:table-cell">Loại</th>
                      <th className="px-5 py-3 font-medium hidden lg:table-cell">Size</th>
                      <th className="px-5 py-3 font-medium">Chunks</th>
                      <th className="px-5 py-3 font-medium">Trạng thái</th>
                      <th className="px-5 py-3 font-medium hidden lg:table-cell">Cập nhật</th>
                      <th className="px-5 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e2d9]">
                    {filteredDocs.map((d) => (
                      <tr key={d.id} className="hover:bg-[#f5f0e8]/50">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[#f5f0e8] flex items-center justify-center">
                              <FileText className="w-5 h-5 text-[#8b6f47]" />
                            </div>
                            <div>
                              <div className="font-medium text-[#1a1a1a]">{d.title}</div>
                              <div className="text-xs text-[#8b8378]">ID: {d.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell">
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-[#f5f0e8] text-xs uppercase text-[#6b6b6b]">
                            {d.type}
                          </span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell text-[#6b6b6b]">{d.size}</td>
                        <td className="px-5 py-4 text-[#1a1a1a] font-medium">{d.chunks}</td>
                        <td className="px-5 py-4">
                          <span className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", statusStyles[d.status])}>
                            {d.status === "indexing" && <FileClock className="w-3 h-3 animate-pulse" />}
                            {statusLabel[d.status]}
                          </span>
                        </td>
                        <td className="px-5 py-4 hidden lg:table-cell text-[#6b6b6b]">{d.updatedAt}</td>
                        <td className="px-5 py-4 relative">
                          <button
                            onClick={() => setMenuOpen(menuOpen === d.id ? null : d.id)}
                            className="p-1.5 rounded-md hover:bg-[#e8e2d9] text-[#6b6b6b]"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {menuOpen === d.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                              <div className="absolute right-5 top-12 z-20 w-40 bg-white border border-[#e8e2d9] rounded-lg shadow-lg overflow-hidden">
                                <button className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5f0e8] w-full text-left">
                                  <Eye className="w-3.5 h-3.5" /> Xem
                                </button>
                                <button onClick={() => handleReindex(d.id)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5f0e8] w-full text-left">
                                  <Edit2 className="w-3.5 h-3.5" /> Tái index
                                </button>
                                <button onClick={() => handleDelete(d.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-[#c94a4a] hover:bg-[#c94a4a]/10 w-full text-left">
                                  <Trash2 className="w-3.5 h-3.5" /> Xoá
                                </button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredDocs.length === 0 && (
                  <div className="text-center py-10 text-[#6b6b6b] text-sm">Không có tài liệu nào</div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#e8e2d9]">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-5 hover:bg-[#f5f0e8]/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-[#3d5a3d]/10 flex items-center justify-center">
                        <LinkIcon className="w-5 h-5 text-[#3d5a3d]" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[#1a1a1a]">{s.name}</div>
                        <a href={s.url} className="text-xs text-[#8b8378] hover:underline truncate block">
                          {s.url}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-right hidden md:block">
                        <div className="text-[#1a1a1a] font-medium">{s.pages} trang</div>
                        <div className="text-xs text-[#8b8378]">Quét: {s.lastCrawl}</div>
                      </div>
                      <button
                        onClick={() => handleCrawl(s.id, s.name)}
                        className="px-3 py-1.5 text-xs bg-[#1a1a1a] text-white rounded-lg hover:bg-[#3d5a3d]"
                      >
                        Quét lại
                      </button>
                    </div>
                  </div>
                ))}
                {sources.length === 0 && (
                  <div className="text-center py-10 text-[#6b6b6b] text-sm">Chưa có nguồn kiến thức</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </AdminShell>
  )
}
