"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  Save,
  Loader2,
  Package,
  Tag,
  ImageIcon,
  Plus,
  X,
  FileText,
  DollarSign,
  Calendar,
  ListChecks,
} from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api"
const CITIES = [
  "Đà Nẵng", "Hội An", "Đà Lạt", "Nha Trang", "Hà Nội",
  "Sapa", "Phú Quốc", "Vịnh Hạ Long", "Huế", "Hồ Chí Minh",
  "Mũi Né", "Côn Đảo",
]

type ComboFormData = {
  title?: string
  destination?: string
  days?: number
  nights?: number
  price?: number
  originalPrice?: number
  image?: string
  description?: string
  includes?: string[]
  excludes?: string[]
  status?: "draft" | "published"
}

export function ComboForm({
  initialData,
  mode = "create",
  comboId,
}: {
  initialData?: ComboFormData
  mode?: "create" | "edit"
  comboId?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ComboFormData>(initialData || {
    title: "",
    destination: "Đà Nẵng",
    days: 3,
    nights: 2,
    price: 0,
    originalPrice: 0,
    image: "",
    description: "",
    includes: [],
    excludes: [],
    status: "draft",
  })
  const [includeInput, setIncludeInput] = useState("")
  const [excludeInput, setExcludeInput] = useState("")

  const update = (k: keyof ComboFormData, v: unknown) => setData((d) => ({ ...d, [k]: v }))

  const addTo = (key: "includes" | "excludes", value: string, clear: () => void) => {
    const t = value.trim()
    if (t && !(data[key] || []).includes(t)) {
      update(key, [...(data[key] || []), t])
    }
    clear()
  }

  const removeFrom = (key: "includes" | "excludes", t: string) => {
    update(key, (data[key] || []).filter((x) => x !== t))
  }

  const handleSave = async (status: "draft" | "published") => {
    if (!data.title?.trim()) {
      toast.error("Vui lòng nhập tên combo")
      return
    }
    setLoading(true)
    const body = {
      title: data.title,
      destination: data.destination,
      num_days: data.days,
      total_cost: data.price,
      original_cost: data.originalPrice,
      cover_image: data.image,
      description: data.description,
      includes: data.includes,
      excludes: data.excludes,
      status: status === "published" ? "PUBLISHED" : "DRAFT",
    }
    try {
      if (mode === "edit" && comboId) {
        await apiFetch(`/combos/${comboId}`, { method: "PUT", body })
      } else {
        await apiFetch("/combos", { method: "POST", body })
      }
      toast.success(
        status === "published"
          ? mode === "edit" ? "Đã cập nhật combo" : "Đã xuất bản combo"
          : "Đã lưu nháp"
      )
      router.push("/admin/combos")
    } catch {
      toast.error("Lưu combo thất bại")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Section title="Thông tin cơ bản" icon={FileText}>
          <Field label="Tên combo" required>
            <input
              type="text"
              value={data.title || ""}
              onChange={(e) => update("title", e.target.value)}
              placeholder="VD: Combo Đà Nẵng - Hội An 3N2Đ"
              className="form-input"
            />
          </Field>

          <div className="grid sm:grid-cols-3 gap-4">
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
            <Field label="Số ngày" required icon={Calendar}>
              <input
                type="number"
                min={1}
                value={data.days || 1}
                onChange={(e) => update("days", Number(e.target.value))}
                className="form-input"
              />
            </Field>
            <Field label="Số đêm" icon={Calendar}>
              <input
                type="number"
                min={0}
                value={data.nights || 0}
                onChange={(e) => update("nights", Number(e.target.value))}
                className="form-input"
              />
            </Field>
          </div>

          <Field label="Mô tả ngắn">
            <textarea
              value={data.description || ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Giới thiệu combo, điểm nổi bật, phù hợp với ai..."
              rows={4}
              className="form-input resize-none"
            />
          </Field>
        </Section>

        <Section title="Giá & ưu đãi" icon={DollarSign}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Giá bán (VNĐ)" required>
              <input
                type="number"
                min={0}
                value={data.price || 0}
                onChange={(e) => update("price", Number(e.target.value))}
                placeholder="3500000"
                className="form-input"
              />
            </Field>
            <Field label="Giá gốc (VNĐ)">
              <input
                type="number"
                min={0}
                value={data.originalPrice || 0}
                onChange={(e) => update("originalPrice", Number(e.target.value))}
                placeholder="4200000"
                className="form-input"
              />
            </Field>
          </div>
          {!!(data.originalPrice && data.price && data.originalPrice > data.price) && (
            <div className="px-3 py-2 bg-[#3d5a3d]/5 border border-[#3d5a3d]/20 rounded-lg text-sm text-[#3d5a3d]">
              Giảm {Math.round((1 - (data.price || 0) / (data.originalPrice || 1)) * 100)}%
            </div>
          )}
        </Section>

        <Section title="Chi tiết" icon={ListChecks}>
          <Field label="Bao gồm">
            <ListEditor
              items={data.includes || []}
              onRemove={(t) => removeFrom("includes", t)}
              inputValue={includeInput}
              setInputValue={setIncludeInput}
              onAdd={() => addTo("includes", includeInput, () => setIncludeInput(""))}
              placeholder="VD: Vé máy bay khứ hồi"
              accent="green"
            />
          </Field>

          <Field label="Không bao gồm">
            <ListEditor
              items={data.excludes || []}
              onRemove={(t) => removeFrom("excludes", t)}
              inputValue={excludeInput}
              setInputValue={setExcludeInput}
              onAdd={() => addTo("excludes", excludeInput, () => setExcludeInput(""))}
              placeholder="VD: Chi phí cá nhân"
              accent="red"
            />
          </Field>
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="Ảnh bìa" icon={ImageIcon}>
          <div className="aspect-[16/9] bg-[#f5f0e8] border-2 border-dashed border-[#e8e2d9] rounded-xl overflow-hidden relative">
            {data.image ? (
              <>
                <Image src={data.image} alt="Preview" fill className="object-cover" />
                <button
                  onClick={() => update("image", "")}
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
            value={data.image || ""}
            onChange={(e) => update("image", e.target.value)}
            placeholder="URL ảnh..."
            className="form-input mt-3"
          />
        </Section>

        <Section title="Xuất bản">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6b6b6b]">Trạng thái</span>
              <span className="font-medium text-[#1a1a1a]">
                {data.status === "published" ? "Đã xuất bản" : "Bản nháp"}
              </span>
            </div>
            <div className="pt-3 border-t border-[#e8e2d9] space-y-2">
              <button
                onClick={() => handleSave("draft")}
                disabled={loading}
                className="w-full py-2.5 border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] hover:bg-[#f5f0e8] inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Lưu nháp
              </button>
              <button
                onClick={() => handleSave("published")}
                disabled={loading}
                className="w-full py-2.5 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#3d5a3d] inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                {mode === "edit" ? "Cập nhật" : "Xuất bản"}
              </button>
            </div>
          </div>
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
        .form-input:focus {
          border-color: #3d5a3d;
        }
        .form-input::placeholder {
          color: #8b8378;
        }
      `}</style>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
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
  label,
  icon: Icon,
  required,
  children,
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

function ListEditor({
  items,
  onRemove,
  inputValue,
  setInputValue,
  onAdd,
  placeholder,
  accent,
}: {
  items: string[]
  onRemove: (t: string) => void
  inputValue: string
  setInputValue: (v: string) => void
  onAdd: () => void
  placeholder: string
  accent: "green" | "red"
}) {
  const styles = accent === "green"
    ? "bg-[#3d5a3d]/10 text-[#3d5a3d]"
    : "bg-[#c94a4a]/10 text-[#c94a4a]"
  return (
    <>
      {items.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {items.map((t) => (
            <li key={t} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${styles}`}>
              <span>{t}</span>
              <button onClick={() => onRemove(t)} className="hover:opacity-70">
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onAdd()
            }
          }}
          placeholder={placeholder}
          className="form-input"
        />
        <button
          onClick={onAdd}
          type="button"
          className="px-3 py-2.5 bg-[#1a1a1a] text-white rounded-lg hover:bg-[#3d5a3d]"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </>
  )
}
