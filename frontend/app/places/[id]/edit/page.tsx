"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { PlaceForm } from "@/components/admin/place-form"
import { apiFetch } from "@/lib/api"
import type { Place } from "@/lib/types"
import { toast } from "sonner"

export default function EditPlacePage() {
  const params  = useParams()
  const id      = params?.id as string
  const [place, setPlace]   = useState<Place | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<{ place: Place }>(`/places/${id}`)
      .then(({ place: p }) => setPlace(p))
      .catch(() => toast.error("Không thể tải thông tin địa điểm"))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <AdminShell title="Đang tải..." description="">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
        </div>
      </AdminShell>
    )
  }

  if (!place) {
    return (
      <AdminShell title="Không tìm thấy" description="Địa điểm không tồn tại">
        <Link href="/admin/places" className="text-[#3d5a3d] hover:underline">← Quay lại danh sách</Link>
      </AdminShell>
    )
  }

  const initial = {
    name:        place.name,
    category:    place.category,
    destination: place.destination,
    area:        place.area || "",
    address:     place.address || "",
    description: place.description || "",
    base_price:  place.base_price || 0,
    open_time:   place.open_time || "",
    close_time:  place.close_time || "",
    phone:       place.phone || "",
    website:     place.website || "",
    cover_image: place.cover_image || "",
    tags:        place.tags || [],
    must_visit:  place.must_visit,
  }

  return (
    <AdminShell
      title={`Chỉnh sửa: ${place.name}`}
      description="Cập nhật thông tin chi tiết cho địa điểm"
      action={
        <Link
          href="/admin/places"
          className="px-4 py-2 bg-white border border-[#e8e2d9] rounded-lg text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f0e8] inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </Link>
      }
    >
      <PlaceForm mode="edit" initialData={initial} placeId={id} />
    </AdminShell>
  )
}
