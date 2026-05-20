"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
  Save,
  Loader2,
  Package,
  ImageIcon,
  Plus,
  X,
  FileText,
  DollarSign,
  Calendar,
  ListChecks,
  Link as LinkIcon,
  Building2,
  Moon,
} from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api"

const CITIES = [
  "Đà Nẵng", "Hội An", "Đà Lạt", "Nha Trang", "Hà Nội",
  "Sapa", "Phú Quốc", "Vịnh Hạ Long", "Huế", "Hồ Chí Minh",
  "Mũi Né", "Côn Đảo",
]

// Field names mirror backend services.CreateComboInput / models.Combo. Keeping
// the form's internal state in the same shape as the wire payload prevents the
// previous drift (title vs name, num_days vs duration_days, etc.) from
// reappearing.
export type ComboFormData = {
  name?: string
  destination?: string
  duration_days?: number
  price_per_person?: number
  cover_image?: string
  provider?: string
  book_url?: string
  includes?: string[]
  benefits?: string[]
  requires_overnight?: boolean
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
    name: "",
    destination: "Đà Nẵng",
    duration_days: 3,
    price_per_person: 0,
    cover_image: "",
    provider: "",
    book_url: "",
    includes: [],
    benefits: [],
    requires_overnight: false,
  })
  const [includeInput, setIncludeInput] = useState("")
  const [benefitInput, setBenefitInput] = useState("")

  const update = <K extends keyof ComboFormData>(k: K, v: ComboFormData[K]) =>
    setData((d) => ({ ...d, [k]: v }))

  const addTo = (key: "includes" | "benefits", value: string, clear: () => void) => {
    const t = value.trim()
    if (t && !(data[key] || []).includes(t)) {
      update(key, [...(data[key] || []), t])
    }
    clear()
  }

  const removeFrom = (key: "includes" | "benefits", t: string) => {
    update(key, (data[key] || []).filter((x) => x !== t))
  }

  const handleSave = async () => {
    if (!data.name?.trim()) {
      toast.error("Vui lòng nhập tên combo")
      return
    }
    if (!data.destination?.trim()) {
      toast.error("Vui lòng chọn điểm đến")
      return
    }
    setLoading(true)
    // Send every field every time, including empty strings. Backend Update
    // DTOs use *string — a missing key is interpreted as "leave as-is", so
    // `|| undefined` would silently prevent users from clearing fields they
    // had set previously.
    const body = {
      name: data.name,
      destination: data.destination,
      duration_days: data.duration_days,
      price_per_person: data.price_per_person,
      cover_image: data.cover_image ?? "",
      provider: data.provider ?? "",
      book_url: data.book_url ?? "",
      includes: data.includes ?? [],
      benefits: data.benefits ?? [],
      requires_overnight: !!data.requires_overnight,
    }
    try {
      if (mode === "edit" && comboId) {
        await apiFetch(`/combos/${comboId}`, { method: "PATCH", body })
        toast.success("Đã cập nhật combo")
      } else {
        await apiFetch("/combos", { method: "POST", body })
        toast.success("Đã tạo combo mới")
      }
      router.push("/admin/combos")
    } catch {
      toast.error(mode === "edit" ? "Cập nhật thất bại" : "Tạo combo thất bại")
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
              value={data.name || ""}
              onChange={(e) => update("name", e.target.value)}
              placeholder="VD: Combo Đà Nẵng - Hội An 3N2Đ"
              className="form-input"
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
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
            <Field label="Số ngày" icon={Calendar}>
              <input
                type="number"
                min={1}
                value={data.duration_days ?? 1}
                onChange={(e) => update("duration_days", Number(e.target.value))}
                className="form-input"
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nhà cung cấp" icon={Building2}>
              <input
                type="text"
                value={data.provider || ""}
                onChange={(e) => update("provider", e.target.value)}
                placeholder="VD: Vietravel"
                className="form-input"
              />
            </Field>
            <Field label="Link đặt chỗ" icon={LinkIcon}>
              <input
                type="url"
                value={data.book_url || ""}
                onChange={(e) => update("book_url", e.target.value)}
                placeholder="https://..."
                className="form-input"
              />
            </Field>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={!!data.requires_overnight}
              onChange={(e) => update("requires_overnight", e.target.checked)}
              className="w-4 h-4 accent-[#3d5a3d]"
            />
            <span className="inline-flex items-center gap-1.5 text-sm text-[#1a1a1a]">
              <Moon className="w-3.5 h-3.5 text-[#8b8378]" />
              Cần lưu trú qua đêm
            </span>
          </label>
        </Section>

        <Section title="Giá" icon={DollarSign}>
          <Field label="Giá / người (VNĐ)">
            <input
              type="number"
              min={0}
              value={data.price_per_person ?? 0}
              onChange={(e) => update("price_per_person", Number(e.target.value))}
              placeholder="3500000"
              className="form-input"
            />
          </Field>
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

          <Field label="Ưu đãi / quyền lợi">
            <ListEditor
              items={data.benefits || []}
              onRemove={(t) => removeFrom("benefits", t)}
              inputValue={benefitInput}
              setInputValue={setBenefitInput}
              onAdd={() => addTo("benefits", benefitInput, () => setBenefitInput(""))}
              placeholder="VD: Miễn phí đưa đón sân bay"
              accent="amber"
            />
          </Field>
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="Ảnh bìa" icon={ImageIcon}>
          <div className="aspect-[16/9] bg-[#f5f0e8] border-2 border-dashed border-[#e8e2d9] rounded-xl overflow-hidden relative">
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
            placeholder="URL ảnh..."
            className="form-input mt-3"
          />
        </Section>

        <Section title="Lưu">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full py-2.5 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#3d5a3d] inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "edit" ? <Save className="w-4 h-4" /> : <Package className="w-4 h-4" />}
            {mode === "edit" ? "Cập nhật combo" : "Tạo combo"}
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
  accent: "green" | "amber"
}) {
  const styles = accent === "green"
    ? "bg-[#3d5a3d]/10 text-[#3d5a3d]"
    : "bg-[#d4a853]/15 text-[#8b6f47]"
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
