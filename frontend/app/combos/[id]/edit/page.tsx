"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { ComboForm } from "@/components/admin/combo-form"
import { RequireAdmin } from "@/components/require-auth"
import { apiFetch } from "@/lib/api"
import type { Combo } from "@/lib/types"

export default function EditComboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [combo, setCombo] = useState<Combo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<Combo>(`/combos/${id}`)
      .then(setCombo)
      .catch(() => notFound())
      .finally(() => setLoading(false))
  }, [id])

  return (
    <RequireAdmin>
      <AdminShell
        title="Chỉnh sửa combo"
        description={`Cập nhật thông tin combo #${id}`}
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
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
          </div>
        ) : combo ? (
          <ComboForm
            mode="edit"
            comboId={id}
            initialData={{
              name: combo.name,
              destination: combo.destination,
              duration_days: combo.duration_days ?? 1,
              price_per_person: combo.price_per_person ?? 0,
              cover_image: combo.cover_image ?? "",
              provider: combo.provider ?? "",
              book_url: combo.book_url ?? "",
              includes: combo.includes ?? [],
              benefits: combo.benefits ?? [],
              requires_overnight: combo.requires_overnight ?? false,
            }}
          />
        ) : null}
      </AdminShell>
    </RequireAdmin>
  )
}
