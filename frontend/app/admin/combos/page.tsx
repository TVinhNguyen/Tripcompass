"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Plus, Search, MoreVertical, Edit2, Trash2, Eye, Package, Calendar, DollarSign, Loader2 } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { apiFetch } from "@/lib/api"
import type { Combo, PaginatedList } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function AdminCombosPage() {
  const [search, setSearch] = useState("")
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [combos, setCombos] = useState<Combo[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<PaginatedList<Combo>>("/combos", { query: { limit: 50 } })
      setCombos(res.data ?? [])
    } catch {
      toast.error("Không thể tải danh sách combo")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    if (!confirm("Xoá combo này?")) return
    try {
      setCombos((prev) => prev.filter((c) => c.id !== id))
      await apiFetch(`/combos/${id}`, { method: "DELETE" })
      toast.success("Đã xoá combo")
    } catch {
      toast.error("Xoá thất bại")
      load()
    }
  }

  const filtered = search
    ? combos.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : combos

  const stats = {
    total: combos.length,
    published: combos.filter((c) => c.status === "PUBLISHED").length,
    totalSold: combos.reduce((s, c) => s + (c.clone_count ?? 0), 0),
    revenue: combos.reduce((s, c) => s + ((c.clone_count ?? 0) * (c.total_cost ?? 0)), 0),
  }

  return (
    <AdminShell
      title="Combo du lịch"
      description={`Quản lý ${combos.length} gói combo`}
      action={
        <Link
          href="/combos/new"
          className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#3d5a3d] inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Tạo combo
        </Link>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Tổng combo", value: stats.total, icon: Package, accent: "bg-[#3d5a3d]" },
          { label: "Đã xuất bản", value: stats.published, icon: Eye, accent: "bg-[#c4785a]" },
          { label: "Lượt dùng", value: stats.totalSold, icon: Calendar, accent: "bg-[#d4a853]" },
          {
            label: "Doanh thu (VNĐ)",
            value: stats.revenue >= 1e9
              ? `${(stats.revenue / 1e9).toFixed(1)}B`
              : `${(stats.revenue / 1e6).toFixed(0)}M`,
            icon: DollarSign,
            accent: "bg-[#8b6f47]",
          },
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

      {/* Filter */}
      <div className="bg-white border border-[#e8e2d9] rounded-2xl p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm combo theo tên..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:shadow-lg transition-shadow">
              <div className="relative aspect-[16/9] bg-[#e8e2d9]">
                <Image
                  src={c.cover_image || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400"}
                  alt={c.title} fill className="object-cover"
                />
                <div className="absolute top-3 left-3">
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium backdrop-blur-md",
                    c.status === "PUBLISHED" ? "bg-[#3d5a3d]/90 text-white" : "bg-[#d4a853]/90 text-[#1a1a1a]",
                  )}>
                    {c.status === "PUBLISHED" ? "Đã xuất bản" : "Bản nháp"}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  <button
                    onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)}
                    className="p-1.5 bg-white/90 backdrop-blur-md rounded-md hover:bg-white"
                  >
                    <MoreVertical className="w-4 h-4 text-[#1a1a1a]" />
                  </button>
                  {menuOpen === c.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                      <div className="absolute right-0 top-10 z-20 w-40 bg-white border border-[#e8e2d9] rounded-lg shadow-lg overflow-hidden">
                        <Link href={`/combos/${c.id}`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5f0e8]">
                          <Eye className="w-3.5 h-3.5" />Xem
                        </Link>
                        <Link href={`/combos/${c.id}/edit`} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f5f0e8]">
                          <Edit2 className="w-3.5 h-3.5" />Chỉnh sửa
                        </Link>
                        <button
                          onClick={() => { setMenuOpen(null); handleDelete(c.id) }}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-[#c94a4a] hover:bg-[#c94a4a]/10 w-full text-left"
                        >
                          <Trash2 className="w-3.5 h-3.5" />Xoá
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-medium text-[#1a1a1a] line-clamp-2 mb-2">{c.title}</h3>
                <div className="flex items-center gap-3 text-xs text-[#6b6b6b] mb-3">
                  <span>{c.destination}</span>
                  <span>·</span>
                  <span>{c.num_days} ngày</span>
                  <span>·</span>
                  <span>{c.clone_count ?? 0} lượt dùng</span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[#e8e2d9]">
                  <div>
                    <div className="font-mono tabular-nums text-base font-semibold text-[#1a1a1a]">
                      {c.total_cost ? `${(c.total_cost / 1000).toFixed(0)}K` : "—"}
                    </div>
                    <div className="text-[10px] tracking-[0.18em] uppercase text-[#8b8378] mt-0.5">VNĐ / người</div>
                  </div>
                  <Link
                    href={`/combos/${c.id}/edit`}
                    className="px-3 py-1.5 text-xs bg-[#1a1a1a] text-white rounded-lg hover:bg-[#3d5a3d]"
                  >
                    Chỉnh sửa
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !loading && (
            <div className="col-span-3 text-center py-16 text-[#6b6b6b]">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Không có combo nào</p>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  )
}
