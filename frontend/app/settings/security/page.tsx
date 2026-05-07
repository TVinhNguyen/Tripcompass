"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Lock, Loader2, Eye, EyeOff, CheckCircle2, Shield } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"
import { RequireAuth } from "@/components/require-auth"

export default function SecurityPage() {
  return (
    <RequireAuth>
      <SecurityContent />
    </RequireAuth>
  )
}

function SecurityContent() {
  const [showPw, setShowPw] = useState(false)
  const [oldPw, setOldPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (newPw.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự")
      return
    }
    if (newPw !== confirmPw) {
      setError("Mật khẩu xác nhận không khớp")
      return
    }
    setLoading(true)
    try {
      await apiFetch("/user/change-password", {
        method: "POST",
        body: { old_password: oldPw, new_password: newPw },
      })
      setSuccess(true)
      setOldPw("")
      setNewPw("")
      setConfirmPw("")
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể đổi mật khẩu"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      <section className="pt-24 pb-16">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/profile" className="inline-flex items-center gap-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] mb-6">
            <ArrowLeft className="w-4 h-4" />
            Quay về hồ sơ
          </Link>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-[#3d5a3d]/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-[#3d5a3d]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a] tracking-tight">Bảo mật</h1>
              <p className="text-sm text-[#6b6b6b]">Quản lý mật khẩu và bảo mật tài khoản</p>
            </div>
          </div>

          <div className="bg-white border border-[#e8e2d9] rounded-2xl p-6 lg:p-8">
            <h2 className="text-base font-semibold text-[#1a1a1a] mb-5 tracking-tight">Đổi mật khẩu</h2>

            {success && (
              <div className="flex items-center gap-3 p-4 bg-[#3d5a3d]/10 border border-[#3d5a3d]/30 rounded-lg mb-5">
                <CheckCircle2 className="w-5 h-5 text-[#3d5a3d] shrink-0" />
                <p className="text-sm text-[#3d5a3d]">Đã cập nhật mật khẩu thành công</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <PasswordField label="Mật khẩu hiện tại" value={oldPw} onChange={setOldPw} show={showPw} onToggle={() => setShowPw(!showPw)} />
              <PasswordField label="Mật khẩu mới" value={newPw} onChange={setNewPw} show={showPw} onToggle={() => setShowPw(!showPw)} hint="Tối thiểu 8 ký tự, bao gồm chữ và số" />
              <PasswordField label="Xác nhận mật khẩu mới" value={confirmPw} onChange={setConfirmPw} show={showPw} onToggle={() => setShowPw(!showPw)} />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button type="submit" disabled={loading} className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-11">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Cập nhật mật khẩu"}
              </Button>
            </form>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
        <input
          type={show ? "text" : "password"}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-12 py-3 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8378] hover:text-[#1a1a1a]"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-xs text-[#8b8378] mt-1">{hint}</p>}
    </div>
  )
}
