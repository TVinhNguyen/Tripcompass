"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { ArrowLeft, Sparkles, MapPin, Users, Calendar, Wallet, Loader2, Save, RefreshCw, Clock } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { RequireAuth } from "@/components/require-auth"
import { apiFetch } from "@/lib/api"
import { savePlanAsItinerary } from "@/lib/plan-to-itinerary"
import type { BudgetTier, GenerateResponse, SlotPlace, Violation } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

const CITIES = [
  "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Hội An", "Huế", "Nha Trang",
  "Đà Lạt", "Phú Quốc", "Sapa", "Hạ Long", "Mộc Châu", "Phan Thiết",
]

const preferenceTags = [
  { id: "food", label: "Ẩm thực" },
  { id: "culture", label: "Văn hoá" },
  { id: "nature", label: "Thiên nhiên" },
  { id: "adventure", label: "Mạo hiểm" },
  { id: "beach", label: "Biển đảo" },
  { id: "shopping", label: "Mua sắm" },
  { id: "nightlife", label: "Ban đêm" },
  { id: "family", label: "Gia đình" },
  { id: "romantic", label: "Lãng mạn" },
  { id: "luxury", label: "Cao cấp" },
]

const travelStyles = [
  { id: "relaxed", label: "Thư thả" },
  { id: "balanced", label: "Cân bằng" },
  { id: "active", label: "Dày lịch" },
] as const

type PlannerAISlot = {
  start?: string
  end?: string
  slot_type?: string
  place_id?: string | null
  place_name?: string | null
  price_vnd?: number | null
  notes?: string
}

type PlannerAIDay = {
  day_num?: number
  date_str?: string
  day_type?: string
  slots?: PlannerAISlot[]
}

type PlannerAISchedule = {
  days?: PlannerAIDay[]
}

type PlannerAIEnvelope = {
  destination?: string
  num_days?: number
  budget_vnd?: number
  budget_tier?: BudgetTier
  budget_breakdown?: Record<string, number>
  final_plan?: PlannerAISchedule | GenerateResponse
  plan?: PlannerAISchedule | GenerateResponse
  violations?: Array<Partial<Violation> & { type?: string; day?: string | number }>
  warnings?: string[]
}

type PlannerGenerateEnvelope =
  | GenerateResponse
  | PlannerAIEnvelope
  | { data?: GenerateResponse | PlannerAIEnvelope }

const FOOD_SLOT_TYPES = new Set(["breakfast", "lunch", "dinner", "snack", "brunch"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function isGenerateResponse(value: unknown): value is GenerateResponse {
  return isRecord(value) && Array.isArray(value.days) && isRecord(value.budget_recap)
}

function slotCategory(slotType: string): SlotPlace["category"] {
  return FOOD_SLOT_TYPES.has(slotType.toLowerCase()) ? "FOOD" : "ATTRACTION"
}

function normalizeViolations(violations: PlannerAIEnvelope["violations"]): Violation[] {
  return (violations ?? []).map((v) => {
    const day = typeof v.day === "number" ? v.day : Number(v.day)
    return {
      rule: v.rule ?? v.type ?? "PLANNER_WARNING",
      severity: v.severity ?? "warning",
      message: v.message ?? "Planner warning",
      day: Number.isFinite(day) ? day : undefined,
    }
  })
}

function toGenerateResponse(envelope: PlannerAIEnvelope, requestedBudget: number, fallbackDestination: string, style: string): GenerateResponse {
  const raw = envelope.final_plan ?? envelope.plan
  if (isGenerateResponse(raw)) return raw
  if (!isRecord(raw) || !Array.isArray(raw.days)) {
    throw new Error("invalid planner response")
  }

  const destinationName = envelope.destination?.trim() || fallbackDestination || "Việt Nam"
  let attractionSpent = 0
  let foodSpent = 0

  const days = raw.days
    .filter(isRecord)
    .map((day, dayIndex) => ({
      day_num: Number(day.day_num) || dayIndex + 1,
      date_str: typeof day.date_str === "string" ? day.date_str : "",
      day_type: typeof day.day_type === "string" ? day.day_type : "standard",
      primary_area: destinationName,
      travel_min: 0,
      buffer_min: 0,
      slots: (Array.isArray(day.slots) ? day.slots : []).filter(isRecord).map((slot) => {
        const slotType = typeof slot.slot_type === "string" ? slot.slot_type : ""
        const placeId = typeof slot.place_id === "string" ? slot.place_id : ""
        const placeName = typeof slot.place_name === "string" ? slot.place_name : ""
        const price = Number(slot.price_vnd) || 0
        const category = slotCategory(slotType)

        const normalized = {
          start: typeof slot.start === "string" ? slot.start : "",
          end: typeof slot.end === "string" ? slot.end : "",
          slot_type: slotType,
          is_buffer: !(placeId && placeName),
          notes: typeof slot.notes === "string" ? slot.notes : undefined,
          place: undefined as SlotPlace | undefined,
        }

        if (placeId && placeName) {
          normalized.place = {
            id: placeId,
            name: placeName,
            category,
            base_price: price,
            duration_min: 0,
            is_must_visit: false,
            is_full_day: false,
            is_free: price === 0,
          }
          if (category === "FOOD") foodSpent += price
          else attractionSpent += price
        }

        return normalized
      }),
    }))

  const breakdown = envelope.budget_breakdown ?? {}
  const hotelTotal = (Number(breakdown.hotel_budget_per_night) || 0) * Math.max(days.length - 1, 0)
  const spent = attractionSpent + foodSpent
  const fallbackBudget =
    (Number(breakdown.attr_budget) || 0) + (Number(breakdown.food_budget) || 0) + hotelTotal
  const totalBudget = Math.max(requestedBudget || Number(envelope.budget_vnd) || fallbackBudget, spent, 0)

  return {
    days,
    budget_recap: {
      total_budget_vnd: totalBudget,
      attraction_spent_vnd: attractionSpent,
      food_spent_vnd: foodSpent,
      remaining_vnd: Math.max(totalBudget - spent, 0),
      within_budget: spent <= totalBudget,
    },
    budget_tier: envelope.budget_tier ?? "standard",
    violations: normalizeViolations(envelope.violations),
    budget_warning: envelope.warnings?.join("\n"),
    slot_template: style === "relaxed" || style === "active" ? style : "standard",
  }
}

function unwrapPlan(payload: PlannerGenerateEnvelope, requestedBudget: number, destination: string, style: string): GenerateResponse {
  if (isGenerateResponse(payload)) return payload
  const data = "data" in payload && payload.data ? payload.data : payload
  if (isGenerateResponse(data)) return data
  return toGenerateResponse(data as PlannerAIEnvelope, requestedBudget, destination, style)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(date.getDate() + days)
  return next
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function QuickPlanContent() {
  const router = useRouter()
  const [destination, setDestination] = useState("")
  const [numDays, setNumDays] = useState(3)
  const [guestCount, setGuestCount] = useState(2)
  const [budget, setBudget] = useState(5000000)
  const [startDate, setStartDate] = useState("")
  const [travelStyle, setTravelStyle] = useState<(typeof travelStyles)[number]["id"]>("balanced")
  const [arrivalTime, setArrivalTime] = useState("")
  const [departureTime, setDepartureTime] = useState("")
  const [prefs, setPrefs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [error, setError] = useState("")

  const togglePref = (id: string) => {
    setPrefs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setError("")
    try {
      const start = startDate ? new Date(startDate) : new Date()
      const end = addDays(start, numDays - 1)
      const payload = await apiFetch<PlannerGenerateEnvelope>("/planner/generate", {
        method: "POST",
        body: {
          destination,
          num_days: numDays,
          guest_count: guestCount,
          budget_vnd: budget,
          start_date: formatDate(start),
          end_date: formatDate(end),
          travel_style: travelStyle,
          arrival_time: arrivalTime || undefined,
          departure_time: departureTime || undefined,
          time_strictness: "balanced",
          preference_tags: prefs,
        },
      })
      const plan = unwrapPlan(payload, budget, destination, travelStyle)
      setResult(plan)
    } catch {
      setError("AI không thể sinh lịch trình. Vui lòng thử lại sau.")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    try {
      const today = startDate ? new Date(startDate) : new Date()
      const end   = new Date(today)
      end.setDate(today.getDate() + (result.days?.length ?? numDays) - 1)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      const it = await savePlanAsItinerary(result, {
        title: `${destination} ${numDays} ngày`,
        destination,
        start_date: fmt(today),
        end_date:   fmt(end),
        budget_vnd: budget,
        guest_count: guestCount,
        tags: prefs,
      })
      toast.success("Đã lưu lịch trình!")
      router.push(`/itinerary/${it.id}/edit`)
    } catch {
      toast.error("Lưu lịch trình thất bại. Thử lại sau.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero */}
      <section className="pt-24 pb-10 bg-gradient-to-br from-[#1a1a1a] via-[#1a1a1a] to-[#3d5a3d]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/ai-planner" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-6">
            <ArrowLeft className="w-4 h-4" />
            Chat với AI
          </Link>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#d4a853]/20 rounded-full text-[#d4a853] text-xs tracking-wider uppercase mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Tạo nhanh
            </div>
            <h1 className="font-serif text-4xl sm:text-5xl font-semibold text-white mb-3 tracking-tight leading-tight">Lịch trình trong 60 giây</h1>
            <p className="text-white/70 text-lg max-w-2xl">
              Điền thông tin cơ bản, AI sẽ sinh ra lịch trình chi tiết tối ưu theo sở thích của bạn.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-8">
            {/* Form */}
            <form onSubmit={handleSubmit} className="lg:col-span-3 bg-white border border-[#e8e2d9] rounded-2xl p-6 lg:p-8 space-y-6">
              {/* Destination */}
              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                  <MapPin className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                  Điểm đến
                </label>
                <input
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  list="cities"
                  placeholder="VD: Đà Nẵng, Hội An..."
                  className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                />
                <datalist id="cities">
                  {CITIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              {/* Days & Guests */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                    <Calendar className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                    Số ngày
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={numDays}
                    onChange={(e) => setNumDays(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                    <Users className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                    Số khách
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={guestCount}
                    onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Ngày bắt đầu</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">
                    <Clock className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                    Nhịp đi
                  </label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#e8e2d9] bg-[#f5f0e8] p-1">
                    {travelStyles.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setTravelStyle(style.id)}
                        className={cn(
                          "h-10 rounded-md px-2 text-xs font-medium transition-colors",
                          travelStyle === style.id
                            ? "bg-white text-[#1a1a1a] shadow-sm"
                            : "text-[#6b6b6b] hover:text-[#1a1a1a]",
                        )}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Travel times */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Giờ đến nơi</label>
                  <input
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Giờ rời đi</label>
                  <input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
                  />
                </div>
              </div>

              {/* Budget slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#1a1a1a]">
                    <Wallet className="inline w-4 h-4 mr-1.5 -mt-0.5" />
                    Ngân sách
                  </label>
                  <span className="text-sm font-semibold text-[#3d5a3d]">
                    {(budget / 1000000).toFixed(1)} triệu VNĐ
                  </span>
                </div>
                <input
                  type="range"
                  min={1000000}
                  max={50000000}
                  step={500000}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full accent-[#3d5a3d]"
                />
                <div className="flex justify-between text-xs text-[#8b8378] mt-1">
                  <span>1tr</span>
                  <span>25tr</span>
                  <span>50tr</span>
                </div>
              </div>

              {/* Preferences */}
              <div>
                <label className="block text-sm font-medium text-[#1a1a1a] mb-3">Sở thích (chọn nhiều)</label>
                <div className="flex flex-wrap gap-2">
                  {preferenceTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => togglePref(t.id)}
                      className={cn(
                        "px-4 py-2 text-sm rounded-full border transition-colors",
                        prefs.includes(t.id)
                          ? "bg-[#3d5a3d] border-[#3d5a3d] text-white"
                          : "border-[#e8e2d9] text-[#6b6b6b] hover:border-[#3d5a3d]",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-12 text-base"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    AI đang suy nghĩ...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2" />
                    Tạo lịch trình ngay
                  </>
                )}
              </Button>
            </form>

            {/* Result */}
            <div className="lg:col-span-2">
              <div className="sticky top-24">
                {loading && <LoadingSkeleton />}
                {!loading && !result && (
                  <div className="bg-gradient-to-br from-[#3d5a3d]/5 to-[#c4785a]/5 border-2 border-dashed border-[#e8e2d9] rounded-2xl p-8 text-center">
                    <Sparkles className="w-12 h-12 text-[#d4a853] mx-auto mb-3" />
                    <h3 className="text-xl font-semibold text-[#1a1a1a] mb-2 tracking-tight">Lịch trình sẽ xuất hiện ở đây</h3>
                    <p className="text-sm text-[#6b6b6b]">Hoàn tất form bên trái và nhấn &ldquo;Tạo lịch trình ngay&rdquo;</p>
                  </div>
                )}
                {!loading && result && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden">
                    <div className="relative h-40">
                      <Image
                        src="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800"
                        alt=""
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <div className="text-[#d4a853] text-xs uppercase tracking-wider mb-1">Đã tạo</div>
                        <div className="text-lg font-semibold text-white tracking-tight">
                          {destination} &bull; {result.days?.length ?? numDays} ngày
                        </div>
                      </div>
                    </div>
                    <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
                      {result.days?.map((d) => (
                        <div key={d.day_num}>
                          <div className="font-medium text-sm text-[#3d5a3d] mb-1">Ngày {d.day_num}: {d.date_str}</div>
                          <ul className="space-y-1">
                            {d.slots.filter((s) => !s.is_buffer && s.place).map((s, si) => (
                              <li key={si} className="flex items-start gap-2 text-xs text-[#6b6b6b]">
                                <div className="w-1 h-1 rounded-full bg-[#c4785a] mt-1.5 shrink-0" />
                                <span>{s.start} – {s.end} · {s.place?.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    {(error) && <p className="px-4 pb-3 text-sm text-red-600">{error}</p>}
                    <div className="p-4 bg-[#f5f0e8] border-t border-[#e8e2d9] grid grid-cols-2 gap-2">
                      <Button onClick={handleSave} disabled={saving} className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white text-xs h-9">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                        Lưu
                      </Button>
                      <Button variant="outline" onClick={() => setResult(null)} className="border-[#e8e2d9] text-[#1a1a1a] text-xs h-9 bg-transparent">
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Tạo lại
                      </Button>
                    </div>
                  </motion.div>
                )}
                {error && !result && !loading && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700 text-sm">{error}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

export default function QuickPlanPage() {
  return (
    <RequireAuth>
      <QuickPlanContent />
    </RequireAuth>
  )
}

function LoadingSkeleton() {
  return (
    <div className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden">
      <div className="h-40 bg-[#e8e2d9] animate-pulse" />
      <div className="p-5 space-y-4">
        <div className="h-4 bg-[#e8e2d9] rounded animate-pulse w-2/3" />
        <div className="space-y-2">
          <div className="h-3 bg-[#e8e2d9] rounded animate-pulse" />
          <div className="h-3 bg-[#e8e2d9] rounded animate-pulse w-5/6" />
          <div className="h-3 bg-[#e8e2d9] rounded animate-pulse w-4/6" />
        </div>
        <div className="flex items-center gap-2 text-xs text-[#6b6b6b]">
          <Loader2 className="w-4 h-4 animate-spin" />
          AI đang sinh lịch trình (có thể mất 30–120s)...
        </div>
      </div>
    </div>
  )
}
