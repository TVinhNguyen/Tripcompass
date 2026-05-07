"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { ComboForm } from "@/components/admin/combo-form"

export default function NewComboPage() {
  return (
    <AdminShell
      title="Tạo combo du lịch"
      description="Thiết kế gói combo mới để bán trên hệ thống"
      action={
        <Link
          href="/admin/combos"
          className="px-4 py-2 bg-white border border-[#e8e2d9] rounded-lg text-sm font-medium text-[#1a1a1a] hover:bg-[#f5f0e8] inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </Link>
      }
    >
      <ComboForm mode="create" />
    </AdminShell>
  )
}
