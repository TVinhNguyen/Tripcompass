"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Camera, Mail, Phone, Calendar, Edit3, Loader2, Lock, Shield, Heart, Map } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { RequireAuth } from "@/components/require-auth"
import { useAuth } from "@/hooks/use-auth"
import { apiFetch, ApiError } from "@/lib/api"
import type { User, Place } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Tab = "profile" | "itineraries" | "saved" | "security"

function ProfileContent() {
  const { user: authUser } = useAuth()
  const [tab, setTab] = useState<Tab>("profile")
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fullName: authUser?.full_name || "",
    bio: "",
    phone: "",
    email: authUser?.email || "",
  })

  // ---- Remote data ----
  const [profile, setProfile] = useState<User | null>(null)
  const [itineraries, setItineraries] = useState<{ id: string; title: string; destination: string; start_date: string; end_date: string; cover_image_url?: string; status: string; view_count: number }[]>([])
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // ---- Change-password state ----
  const [oldPassword, setOldPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPass, setChangingPass] = useState(false)

  // Load profile once
  useEffect(() => {
    apiFetch<{ user: User }>("/user/profile")
      .then(({ user }) => {
        setProfile(user)
        setForm({ fullName: user.full_name, bio: user.bio || "", phone: user.phone || "", email: user.email })
      })
      .catch(() => {})
  }, [])

  // Load tab-specific data lazily
  useEffect(() => {
    if (tab === "itineraries" && itineraries.length === 0) {
      setLoadingData(true)
      apiFetch<{ data: typeof itineraries }>("/itineraries")
        .then(({ data }) => setItineraries(data))
        .catch(() => {})
        .finally(() => setLoadingData(false))
    }
    if (tab === "saved" && savedPlaces.length === 0) {
      setLoadingData(true)
      apiFetch<{ data: Place[] }>("/user/saved-places")
        .then(({ data }) => setSavedPlaces(data))
        .catch(() => {})
        .finally(() => setLoadingData(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const handleSave = async () => {
    setSaving(true)
    try {
      const { user } = await apiFetch<{ user: User }>("/user/profile", {
        method: "PATCH",
        body: { full_name: form.fullName, bio: form.bio, phone: form.phone },
      })
      setProfile(user)
      setEditing(false)
      toast.success("Cập nhật hồ sơ thành công")
    } catch {
      toast.error("Đã xảy ra lỗi. Vui lòng thử lại.")
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error("Mật khẩu xác nhận không khớp"); return }
    if (newPassword.length < 8) { toast.error("Mật khẩu mới phải ít nhất 8 ký tự"); return }
    setChangingPass(true)
    try {
      await apiFetch("/user/change-password", {
        method: "POST",
        body: { old_password: oldPassword, new_password: newPassword },
      })
      toast.success("Đổi mật khẩu thành công. Vui lòng đăng nhập lại.")
      setOldPassword(""); setNewPassword(""); setConfirmPassword("")
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) toast.error("Mật khẩu cũ không đúng.")
      else toast.error("Đổi mật khẩu thất bại.")
    } finally {
      setChangingPass(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "profile", label: "Hồ sơ", icon: Edit3 },
    { id: "itineraries", label: "Lịch trình", icon: Map },
    { id: "saved", label: "Đã lưu", icon: Heart },
    { id: "security", label: "Bảo mật", icon: Shield },
  ]

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Header */}
      <section className="pt-20 pb-8 bg-gradient-to-br from-[#1a1a1a] to-[#3d5a3d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6">
            <div className="relative shrink-0">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-[#d4a853] bg-[#1a1a1a]">
                <Image
                  src={profile?.avatar_url || "https://ui-avatars.com/api/?name=" + encodeURIComponent(form.fullName) + "&background=3d5a3d&color=fff&size=128"}
                  alt="Avatar"
                  width={128}
                  height={128}
                  className="w-full h-full object-cover"
                />
              </div>
              <button className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-[#d4a853] hover:bg-[#c49843] flex items-center justify-center shadow-lg">
                <Camera className="w-4 h-4 text-[#1a1a1a]" />
              </button>
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-white mb-1 tracking-tight leading-tight">{form.fullName}</h1>
              <p className="text-white/70 text-sm mb-2">{form.email}</p>
              <div className="flex items-center gap-4 text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("vi-VN", { month: "long", year: "numeric" }) : ""}
                </span>
                <span>•</span>
                <span>{itineraries.length} lịch trình</span>
                <span>•</span>
                <span>{savedPlaces.length} địa điểm đã lưu</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="border-b border-[#e8e2d9] bg-white sticky top-16 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  tab === t.id
                    ? "border-[#3d5a3d] text-[#1a1a1a]"
                    : "border-transparent text-[#6b6b6b] hover:text-[#1a1a1a]",
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {tab === "profile" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-[#1a1a1a] tracking-tight">Thông tin cá nhân</h2>
                {!editing && (
                  <Button onClick={() => setEditing(true)} variant="outline" className="border-[#e8e2d9] bg-transparent">
                    <Edit3 className="w-4 h-4 mr-2" />
                    Chỉnh sửa
                  </Button>
                )}
              </div>

              <div className="bg-white border border-[#e8e2d9] rounded-2xl p-6 space-y-5">
                <Field label="Họ và tên" editing={editing} value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
                <Field label="Giới thiệu bản thân" editing={editing} value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} textarea />
                <Field label="Số điện thoại" editing={editing} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} icon={Phone} />
                <Field label="Email" editing={false} value={form.email} onChange={() => {}} icon={Mail} />

                {editing && (
                  <div className="flex gap-3 pt-3">
                    <Button onClick={handleSave} disabled={saving} className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Lưu thay đổi"}
                    </Button>
                    <Button onClick={() => setEditing(false)} variant="outline" className="border-[#e8e2d9] bg-transparent">
                      Huỷ
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {tab === "itineraries" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-[#1a1a1a] tracking-tight">Lịch trình của tôi</h2>
                <Link href="/itinerary/new">
                  <Button className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white">Tạo lịch trình mới</Button>
                </Link>
              </div>
              {loadingData ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
                </div>
              ) : itineraries.length === 0 ? (
                <div className="text-center py-20 bg-white border border-[#e8e2d9] rounded-2xl">
                  <Map className="w-12 h-12 text-[#8b8378] mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-[#1a1a1a] mb-2">Chưa có lịch trình nào</h3>
                  <p className="text-[#6b6b6b] mb-6">Hãy tạo lịch trình đầu tiên của bạn</p>
                  <Link href="/itinerary/new"><Button className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white">Tạo ngay</Button></Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {itineraries.map((it) => (
                    <Link key={it.id} href={`/itinerary/${it.id}`} className="block group bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:border-[#3d5a3d]/40 hover:shadow-lg transition-all">
                      <div className="aspect-[16/10] bg-[#e8e2d9] relative overflow-hidden">
                        {it.cover_image_url && <Image src={it.cover_image_url} alt={it.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-[#1a1a1a] mb-1 line-clamp-1">{it.title}</h3>
                        <p className="text-sm text-[#6b6b6b]">{it.destination}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "saved" && (
            <div>
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-6 tracking-tight">Địa điểm đã lưu</h2>
              {loadingData ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
                </div>
              ) : savedPlaces.length === 0 ? (
                <div className="text-center py-20 bg-white border border-[#e8e2d9] rounded-2xl">
                  <Heart className="w-12 h-12 text-[#8b8378] mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-[#1a1a1a] mb-2">Chưa lưu địa điểm nào</h3>
                  <p className="text-[#6b6b6b] mb-6">Khám phá và lưu những nơi bạn yêu thích</p>
                  <Link href="/places"><Button className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white">Khám phá</Button></Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {savedPlaces.map((p) => (
                    <Link key={p.id} href={`/places/${p.id}`} className="block group bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:border-[#3d5a3d]/40 hover:shadow-lg transition-all">
                      <div className="aspect-[4/3] bg-[#e8e2d9] relative overflow-hidden">
                        {p.cover_image && <Image src={p.cover_image} alt={p.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-[#1a1a1a] mb-1 line-clamp-1">{p.name}</h3>
                        <p className="text-sm text-[#6b6b6b]">{p.area || p.destination}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "security" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-6 tracking-tight">Bảo mật</h2>
              <div className="bg-white border border-[#e8e2d9] rounded-2xl p-6 space-y-4">
                <h3 className="font-medium text-[#1a1a1a] flex items-center gap-2"><Lock className="w-4 h-4" /> Đổi mật khẩu</h3>
                <Field label="Mật khẩu cũ" editing value={oldPassword} onChange={setOldPassword} />
                <Field label="Mật khẩu mới" editing value={newPassword} onChange={setNewPassword} />
                <Field label="Xác nhận mật khẩu mới" editing value={confirmPassword} onChange={setConfirmPassword} />
                <Button onClick={handleChangePassword} disabled={changingPass} className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white">
                  {changingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : "Đổi mật khẩu"}
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  )
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  )
}

function Field({
  label,
  value,
  onChange,
  editing,
  textarea,
  icon: Icon,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  editing: boolean
  textarea?: boolean
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#8b8378] uppercase tracking-wider mb-1.5">{label}</label>
      {editing && label !== "Email" ? (
        textarea ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d] resize-none"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
          />
        )
      ) : (
        <div className="flex items-center gap-2 text-[#1a1a1a]">
          {Icon && <Icon className="w-4 h-4 text-[#8b8378]" />}
          <span>{value || "Chưa cập nhật"}</span>
        </div>
      )}
    </div>
  )
}
