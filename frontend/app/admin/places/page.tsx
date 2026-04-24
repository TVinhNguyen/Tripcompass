"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Plus, Search, Filter, MoreVertical, Edit2, Trash2, Eye, Star, MapPin, Loader2 } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { apiFetch } from "@/lib/api"
import type { Place, PlaceCategory, PaginatedList } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const CATEGORIES: { id: PlaceCategory | "all"; label: string }[] = [
  { id: "all",        label: "Tất cả danh mục" },
  { id: "ATTRACTION", label: "Tham quan" },
  { id: "FOOD",       label: "Ăn uống" },
  { id: "STAY",       label: "Lưu trú" },
]

const CITIES = [
  "all", "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Hội An", "Huế",
  "Nha Trang", "Đà Lạt", "Phú Quốc", "Sapa", "Hạ Long",
]

export default function AdminPlacesPage() {
  const [places, setPlaces]   = useState<Place[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState("")
  const [category, setCategory] = useState<PlaceCategory | "all">("all")
  const [city, setCity]       = useState("all")
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [page, setPage]       = useState(1)

  const fetchPlaces = async () => {
    setLoading(true)
    try {
      const res = await apiFetch<PaginatedList<Place>>("/places", {
        query: {
          page,
          limit: 20,
          ...(search   ? { q: search }            : {}),
          ...(category !== "all" ? { category }   : {}),
          ...(city     !== "all" ? { destination: city } : {}),
        },
      })
      setPlaces(res.data || [])
      setTotal(res.total || 0)
    } catch {
      toast.error("Không thể tải danh sách địa điểm")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPlaces() }, [search, category, city, page]) // eslint-disable-line

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc muốn xoá địa điểm này?")) return
    setPlaces((prev) => prev.filter((p) => p.id !== id))
    setMenuOpen(null)
    try {
      await apiFetch(`/places/${id}`, { method: "DELETE" })
      toast.success("Đã xoá địa điểm")
    } catch {
      toast.error("Xoá thất bại"); fetchPlaces()
    }
  }

  return (
    <AdminShell
      title="Địa điểm"
      description={`Quản lý ${total} địa điểm trên hệ thống`}
      action={
        <Link
          href="/places/new"
          className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#3d5a3d] inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Thêm địa điểm
        </Link>
      }
    >
      {/* Filter bar */}
      <div className="bg-white border border-[#e8e2d9] rounded-2xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Tìm theo tên địa điểm..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value as PlaceCategory | "all"); setPage(1) }}
              className="px-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
            >
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <select
              value={city}
              onChange={(e) => { setCity(e.target.value); setPage(1) }}
              className="px-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
            >
              {CITIES.map((c) => <option key={c} value={c}>{c === "all" ? "Tất cả thành phố" : c}</option>)}
            </select>
            <button className="px-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] hover:bg-[#e8e2d9] inline-flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Lọc nâng cao
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f0e8] text-left text-xs uppercase tracking-wider text-[#8b8378]">
                  <th className="px-5 py-3 font-medium">Địa điểm</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Danh mục</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Điểm đến</th>
                  <th className="px-5 py-3 font-medium">Đánh giá</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Giá cơ bản</th>
                  <th className="px-5 py-3 font-medium w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d9]">
                {places.map((place) => (
                  <tr key={place.id} className="hover:bg-[#f5f0e8]/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#e8e2d9]">
                          {place.cover_image && (
                            <Image
                              src={place.cover_image}
                              alt={place.name}
                              width={48} height={48}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-[#1a1a1a] truncate">{place.name}</div>
                          <div className="text-xs text-[#8b8378] flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {place.address || place.area || place.destination}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="inline-flex items-center px-2 py-1 rounded-full bg-[#f5f0e8] text-xs text-[#1a1a1a]">
                        {place.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell text-[#6b6b6b]">{place.destination}</td>
                    <td className="px-5 py-4">
                      {place.rating != null ? (
                        <div className="inline-flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-[#d4a853] text-[#d4a853]" />
                          <span className="font-medium">{place.rating.toFixed(1)}</span>
                          <span className="text-xs text-[#8b8378]">({place.review_count})</span>
                        </div>
                      ) : <span className="text-[#8b8378] text-xs">Chưa có</span>}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell text-[#6b6b6b]">
                      {place.base_price != null ? `${place.base_price.toLocaleString("vi-VN")}đ` : "—"}
                    </td>
                    <td className="px-5 py-4 relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === place.id ? null : place.id)}
                        className="p-1.5 rounded-md hover:bg-[#e8e2d9] text-[#6b6b6b]"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpen === place.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                          <div className="absolute right-5 top-12 z-20 w-44 bg-white border border-[#e8e2d9] rounded-lg shadow-lg overflow-hidden">
                            <Link href={`/places/${place.id}`} className="flex items-center gap-2 px-3 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f0e8]">
                              <Eye className="w-3.5 h-3.5" /> Xem
                            </Link>
                            <Link href={`/places/${place.id}/edit`} className="flex items-center gap-2 px-3 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f0e8]">
                              <Edit2 className="w-3.5 h-3.5" /> Chỉnh sửa
                            </Link>
                            <button
                              onClick={() => handleDelete(place.id)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-[#c94a4a] hover:bg-[#c94a4a]/10 w-full text-left"
                            >
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
          </div>
        )}
        {!loading && places.length === 0 && (
          <div className="py-12 text-center text-[#8b8378]">Không có địa điểm phù hợp.</div>
        )}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#e8e2d9] text-sm">
          <span className="text-[#8b8378]">
            Hiển thị <span className="text-[#1a1a1a] font-medium">{places.length}</span> / {total} địa điểm
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 border border-[#e8e2d9] rounded-md text-[#1a1a1a] hover:bg-[#f5f0e8] disabled:opacity-40"
            >
              ← Trước
            </button>
            <button className="px-3 py-1.5 bg-[#1a1a1a] text-white rounded-md">{page}</button>
            <button
              disabled={places.length < 20}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border border-[#e8e2d9] rounded-md text-[#1a1a1a] hover:bg-[#f5f0e8] disabled:opacity-40"
            >
              Sau →
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
