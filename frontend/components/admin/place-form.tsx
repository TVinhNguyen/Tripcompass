"use client"

import React, { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  Save, Loader2, MapPin, Tag, DollarSign, Clock,
  Phone, Globe, ImageIcon, Plus, X, FileText,
} from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api"
import type { PlaceCategory } from "@/lib/types"

// ---------------------------------------------------------------------------
// Form data shape — matches API Place fields
// ---------------------------------------------------------------------------
export type PlaceFormData = {
  name?: string
  category?: PlaceCategory
  destination?: string
  area?: string
  address?: string
  description?: string
  base_price?: number
  open_time?: string
  close_time?: string
  phone?: string
  website?: string
  cover_image?: string
  tags?: string[]
  must_visit?: boolean
}

const CATEGORIES: { id: PlaceCategory; label: string }[] = [
  { id: "ATTRACTION", label: "Tham quan" },
  { id: "FOOD",       label: "Ăn uống"   },
  { id: "STAY",       label: "Lưu trú"   },
]

const CITIES = [
  "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Hội An", "Huế",
  "Nha Trang", "Đà Lạt", "Phú Quốc", "Sapa", "Hạ Long",
]

export function PlaceForm({
  initialData,
  mode = "create",
  placeId,
}: {
  initialData?: PlaceFormData
  mode?: "create" | "edit"
  placeId?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PlaceFormData>(initialData || {
    name:        "",
    category:    "ATTRACTION",
    destination: "Đà Nẵng",
    area:        "",
    address:     "",
    description: "",
    base_price:  0,
    open_time:   "",
    close_time:  "",
    phone:       "",
    website:     "",
    cover_image: "",
    tags:        [],
    must_visit:  false,
  })
  const [tagInput, setTagInput] = useState("")

  const update = <K extends keyof PlaceFormData>(k: K, v: PlaceFormData[K]) =>
    setData((d) => ({ ...d, [k]: v }))

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !(data.tags || []).includes(t)) {
      update("tags", [...(data.tags || []), t])
    }
    setTagInput("")
  }

  const removeTag = (t: string) =>
    update("tags", (data.tags || []).filter((x) => x !== t))

  const handleSave = async () => {
    if (!data.name?.trim()) { toast.error("Vui lòng nhập tên địa điểm"); return }
    setLoading(true)
    try {
      if (mode === "edit" && placeId) {
        await apiFetch(`/places/${placeId}`, { method: "PUT", body: data })
        toast.success("Đã cập nhật địa điểm")
      } else {
        await apiFetch("/places", { method: "POST", body: data })
        toast.success("Đã tạo địa điểm mới")
      }
      router.push("/admin/places")
    } catch {
      toast.error(mode === "edit" ? "Cập nhật thất bại" : "Tạo mới thất bại")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main form */}
      <div className="lg:col-span-2 space-y-6">
        {/* Basic */}
        <Section title="Thông tin cơ bản" icon={FileText}>
          <Field label="Tên địa điểm" required>
            <input
              type="text"
              value={data.name || ""}
              onChange={(e) => update("name", e.target.value)}
              placeholder="VD: Coffee Apartment"
              className="form-input"
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Danh mục" required>
              <select
                value={data.category || "ATTRACTION"}
                onChange={(e) => update("category", e.target.value as PlaceCategory)}
                className="form-input"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Điểm đến" required>
              <select
                value={data.destination || ""}
                onChange={(e) => update("destination", e.target.value)}
                className="form-input"
              >
                {CITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Khu vực / Area">
            <input
              type="text"
              value={data.area || ""}
              onChange={(e) => update("area", e.target.value)}
              placeholder="VD: Quận Hải Châu"
              className="form-input"
            />
          </Field>

          <Field label="Địa chỉ" icon={MapPin} required>
            <input
              type="text"
              value={data.address || ""}
              onChange={(e) => update("address", e.target.value)}
              placeholder="VD: 101 Đội Cấn, Ba Đình, Hà Nội"
              className="form-input"
            />
          </Field>

          <Field label="Mô tả">
            <textarea
              value={data.description || ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Mô tả chi tiết về địa điểm, không gian, điểm nổi bật..."
              rows={4}
              className="form-input resize-none"
            />
          </Field>

          <div className="flex items-center gap-3">
            <input
              id="must_visit"
              type="checkbox"
              checked={data.must_visit || false}
              onChange={(e) => update("must_visit", e.target.checked)}
              className="w-4 h-4 accent-[#3d5a3d]"
            />
            <label htmlFor="must_visit" className="text-sm text-[#1a1a1a]">
              Điểm bắt buộc tham quan (must-visit)
            </label>
          </div>
        </Section>

        {/* Details */}
        <Section title="Chi tiết" icon={Tag}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Giá cơ bản (VNĐ)" icon={DollarSign}>
              <input
                type="number"
                min={0}
                value={data.base_price || 0}
                onChange={(e) => update("base_price", Number(e.target.value))}
                className="form-input"
              />
            </Field>
            <Field label="Giờ mở cửa" icon={Clock}>
              <input
                type="text"
                value={data.open_time || ""}
                onChange={(e) => update("open_time", e.target.value)}
                placeholder="VD: 08:00"
                className="form-input"
              />
            </Field>
            <Field label="Giờ đóng cửa" icon={Clock}>
              <input
                type="text"
                value={data.close_time || ""}
                onChange={(e) => update("close_time", e.target.value)}
                placeholder="VD: 22:00"
                className="form-input"
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Số điện thoại" icon={Phone}>
              <input
                type="tel"
                value={data.phone || ""}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="0901 234 567"
                className="form-input"
              />
            </Field>
            <Field label="Website" icon={Globe}>
              <input
                type="url"
                value={data.website || ""}
                onChange={(e) => update("website", e.target.value)}
                placeholder="https://..."
                className="form-input"
              />
            </Field>
          </div>

          <Field label="Tags">
            <div className="flex flex-wrap gap-2 mb-2">
              {(data.tags || []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3d5a3d]/10 text-[#3d5a3d] rounded-full text-xs">
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-[#c94a4a]">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
                placeholder="Thêm tag và nhấn Enter"
                className="form-input"
              />
              <button
                onClick={addTag}
                type="button"
                className="px-3 py-2.5 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#3d5a3d]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </Field>
        </Section>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Image */}
        <Section title="Hình ảnh" icon={ImageIcon}>
          <div className="aspect-[4/3] bg-[#f5f0e8] border-2 border-dashed border-[#e8e2d9] rounded-xl overflow-hidden relative">
            {data.cover_image ? (
              <>
                <Image src={data.cover_image} alt="Preview" fill className="object-cover" />
                <button
                  onClick={() => update("cover_image", "")}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[#8b8378]">
                <ImageIcon className="w-8 h-8 mb-2" />
                <p className="text-sm">Chưa có ảnh</p>
              </div>
            )}
          </div>
          <input
            type="url"
            value={data.cover_image || ""}
            onChange={(e) => update("cover_image", e.target.value)}
            placeholder="URL ảnh bìa..."
            className="form-input mt-3"
          />
        </Section>

        {/* Save */}
        <Section title="Lưu">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full py-2.5 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#3d5a3d] inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {mode === "edit" ? "Cập nhật địa điểm" : "Tạo địa điểm mới"}
          </button>
        </Section>
      </div>

      <style jsx global>{`
        .form-input {
          width: 100%;
          padding: 0.625rem 0.875rem;
          background-color: #f5f0e8;
          border: 1px solid #e8e2d9;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          color: #1a1a1a;
          outline: none;
          transition: border-color 0.15s;
        }
        .form-input:focus { border-color: #3d5a3d; }
        .form-input::placeholder { color: #8b8378; }
      `}</style>
    </div>
  )
}

function Section({
  title, icon: Icon, children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-[#e8e2d9] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#e8e2d9]">
        {Icon && <Icon className="w-4 h-4 text-[#8b6f47]" />}
        <h3 className="text-[11px] font-mono tracking-[0.24em] uppercase font-semibold text-[#1a1a1a]">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({
  label, icon: Icon, required, children,
}: {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-sm font-medium text-[#1a1a1a] mb-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-[#8b8378]" />}
        {label}
        {required && <span className="text-[#c4785a]">*</span>}
      </span>
      {children}
    </label>
  )
}
