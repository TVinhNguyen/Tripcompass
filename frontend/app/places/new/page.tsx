"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { PlaceForm } from "@/components/admin/place-form"

export default function NewPlacePage() {
  return (
    <AdminShell
      title="Thêm địa điểm mới"
      description="Tạo một địa điểm mới để đưa vào hệ thống TripCompass"
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
      <PlaceForm mode="create" />
    </AdminShell>
  )
}
