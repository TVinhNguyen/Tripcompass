"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { RequireAuth } from "@/components/require-auth"
import { apiFetch } from "@/lib/api"
import type { Itinerary } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const CITIES = [
  "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Hội An", "Huế",
  "Nha Trang", "Đà Lạt", "Phú Quốc", "Sapa", "Hạ Long",
]

const STEPS = [
  { id: 1, title: "Thông tin cơ bản" },
  { id: 2, title: "Chủ đề" },
  { id: 3, title: "Hoàn tất" },
]

const tagOptions = [
  "Ẩm thực", "Văn hoá", "Thiên nhiên", "Mạo hiểm", "Biển đảo",
  "Gia đình", "Lãng mạn", "Nghỉ dưỡng", "Khám phá", "Chụp ảnh",
]

function NewItineraryPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState("")
  const [destination, setDestination] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [guestCount, setGuestCount] = useState(2)
  const [budget, setBudget] = useState(5000000)
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const canNext = () => {
    if (step === 1) return title && destination && startDate && endDate
    return true
  }

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const handleCreate = async () => {
    setLoading(true)
    try {
      const it = await apiFetch<Itinerary>("/itineraries", {
        method: "POST",
        body: {
          title: title.trim(),
          destination,
          start_date: startDate,
          end_date: endDate,
          budget,
          guest_count: guestCount,
          tags,
          budget_category: "MODERATE",
        },
      })
      toast.success("Lịch trình đã được tạo!")
      router.push(`/itinerary/${it.id}/edit`)
    } catch {
      toast.error("Tạo lịch trình thất bại. Văn lưu lại sau.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      <section className="pt-28 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back link */}
          <Link
            href="/planner"
            className="inline-flex items-center gap-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] mb-10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </Link>

          {/* Header */}
          <div className="mb-14">
            <div className="flex items-center gap-3 text-[11px] tracking-[0.24em] uppercase text-[#8b8378] mb-4 font-mono tabular-nums">
              <span>Step {String(step).padStart(2, "0")}</span>
              <span className="w-8 h-px bg-[#8b8378]/40" />
              <span>{String(STEPS.length).padStart(2, "0")}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold text-[#1a1a1a] leading-tight tracking-tight">
              {step === 1 && "Kể về chuyến đi của bạn"}
              {step === 2 && "Chọn phong cách"}
              {step === 3 && "Sẵn sàng cất cánh"}
            </h1>
            <p className="mt-3 text-[#6b6b6b]">
              {step === 1 && "Một vài thông tin cơ bản để chúng tôi chuẩn bị khung lịch trình cho bạn."}
              {step === 2 && "Giúp chúng tôi hiểu chuyến đi lý tưởng của bạn. Chọn bao nhiêu tuỳ thích."}
              {step === 3 && "Hãy xem lại trước khi tạo. Bạn có thể chỉnh sửa bất cứ lúc nào sau này."}
            </p>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-3 mb-12">
            {STEPS.map((s) => (
              <div key={s.id} className="flex-1">
                <div
                  className={cn(
                    "h-1 rounded-full transition-colors",
                    step > s.id
                      ? "bg-[#3d5a3d]"
                      : step === s.id
                      ? "bg-[#1a1a1a]"
                      : "bg-[#e8e2d9]",
                  )}
                />
                <div className="flex items-center justify-between mt-3">
                  <span
                    className={cn(
                      "text-[10px] tracking-[0.2em] uppercase font-mono tabular-nums",
                      step >= s.id ? "text-[#1a1a1a]" : "text-[#8b8378]",
                    )}
                  >
                    {String(s.id).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "text-xs hidden sm:block",
                      step >= s.id ? "text-[#1a1a1a] font-medium" : "text-[#8b8378]",
                    )}
                  >
                    {s.title}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Panels */}
          <div className="min-h-[340px]">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="1"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-7"
                >
                  <FormField label="Tên lịch trình" hint="Ví dụ: Đà Nẵng 3 ngày cuối tuần">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Đặt tên chuyến đi..."
                      className="form-input"
                    />
                  </FormField>

                  <FormField label="Điểm đến">
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      list="dests"
                      placeholder="Thành phố bạn muốn đi..."
                      className="form-input"
                    />
                    <datalist id="dests">
                      {CITIES.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </FormField>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <FormField label="Ngày bắt đầu">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="form-input tabular-nums"
                      />
                    </FormField>
                    <FormField label="Ngày kết thúc">
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="form-input tabular-nums"
                      />
                    </FormField>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <FormField label="Số khách" hint="người">
                      <input
                        type="number" min={1} max={20}
                        value={guestCount}
                        onChange={(e) => setGuestCount(Number(e.target.value))}
                        className="form-input tabular-nums"
                      />
                    </FormField>
                    <FormField label="Ngân sách (VNĐ)" hint="ước tính">
                      <input
                        type="number" min={0} step={500000}
                        value={budget}
                        onChange={(e) => setBudget(Number(e.target.value))}
                        className="form-input tabular-nums"
                      />
                    </FormField>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="2"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center justify-between mb-5">
                    <div className="text-[11px] tracking-[0.24em] uppercase text-[#8b8378]">
                      Đã chọn · {String(tags.length).padStart(2, "0")}
                    </div>
                    {tags.length > 0 && (
                      <button
                        onClick={() => setTags([])}
                        className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a] underline underline-offset-4"
                      >
                        Xoá tất cả
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {tagOptions.map((t) => (
                      <button
                        key={t}
                        onClick={() => toggleTag(t)}
                        className={cn(
                          "px-4 py-2 rounded-full border text-sm transition-all",
                          tags.includes(t)
                            ? "bg-[#1a1a1a] border-[#1a1a1a] text-white"
                            : "bg-white border-[#e8e2d9] text-[#6b6b6b] hover:border-[#1a1a1a]/40 hover:text-[#1a1a1a]",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="3"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="border border-[#e8e2d9] rounded-2xl overflow-hidden bg-white">
                    <div className="px-5 py-4 border-b border-[#e8e2d9] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#3d5a3d] flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-[11px] tracking-[0.2em] uppercase text-[#8b8378]">Tóm tắt</div>
                        <div className="text-sm font-medium text-[#1a1a1a]">Kiểm tra thông tin</div>
                      </div>
                    </div>
                    <dl className="divide-y divide-[#e8e2d9]">
                      <SummaryRow label="Tên" value={title || "Chưa đặt tên"} />
                      <SummaryRow label="Điểm đến" value={destination || "—"} />
                      <SummaryRow
                        label="Thời gian"
                        value={startDate && endDate ? `${startDate} → ${endDate}` : "—"}
                      />
                      <SummaryRow label="Số khách" value={`${guestCount} người`} />
                      <SummaryRow label="Ngân sách" value={`${(budget/1_000_000).toFixed(1)} triệu VNĐ`} />
                      <SummaryRow
                        label="Chủ đề"
                        value={tags.length > 0 ? tags.join(", ") : "Không có"}
                      />
                    </dl>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-12 pt-8 border-t border-[#e8e2d9]">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className="h-11 border-[#e8e2d9] bg-transparent text-[#1a1a1a] disabled:opacity-30"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Quay lại
            </Button>
            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="h-11 bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white"
              >
                Tiếp tục
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={loading}
                className="h-11 bg-[#3d5a3d] hover:bg-[#2d4a2d] text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Tạo lịch trình
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

export default function NewItineraryPageWrapper() {
  return (
    <RequireAuth>
      <NewItineraryPage />
    </RequireAuth>
  )
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] tracking-[0.2em] uppercase text-[#8b8378]">{label}</label>
        {hint && <span className="text-[11px] text-[#8b8378] italic">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-6 px-5 py-3.5">
      <dt className="text-[11px] tracking-[0.2em] uppercase text-[#8b8378] shrink-0 mt-0.5">{label}</dt>
      <dd className="text-sm text-[#1a1a1a] text-right font-medium">{value}</dd>
    </div>
  )
}
