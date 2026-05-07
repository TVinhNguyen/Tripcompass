"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, Mail, Lock, User, Check } from "lucide-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState("")

  const pwRules = {
    length: password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /\d/.test(password),
    matches: password.length > 0 && password === confirmPassword,
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!pwRules.length || !pwRules.hasLetter || !pwRules.hasNumber) {
      setError("Mật khẩu chưa đáp ứng yêu cầu bảo mật")
      return
    }
    if (!pwRules.matches) {
      setError("Mật khẩu xác nhận không khớp")
      return
    }
    if (!accepted) {
      setError("Vui lòng đồng ý điều khoản sử dụng")
      return
    }
    setLoading(true)
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: { email, password, full_name: fullName },
        auth: false,
      })
      router.push(`/auth/verify?email=${encodeURIComponent(email)}`)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError("Email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.")
        else setError(err.message || "Đăng ký thất bại.")
      } else {
        setError("Không thể kết nối server. Thử lại sau.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Tạo tài khoản"
      subtitle="Bắt đầu hành trình khám phá Việt Nam cùng TripCompass"
      image="https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1200"
      quote={{
        text: "Đi một ngày đàng, học một sàng khôn.",
        author: "Tục ngữ Việt Nam",
      }}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full name */}
        <div className="space-y-2">
          <label htmlFor="fullName" className="text-sm font-medium text-[#1a1a1a]">
            Họ và tên
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="w-full pl-10 pr-4 py-3 bg-white border border-[#e8e2d9] rounded-lg text-[#1a1a1a] placeholder-[#8b8378] focus:outline-none focus:border-[#3d5a3d] focus:ring-2 focus:ring-[#3d5a3d]/10 transition-all"
            />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-[#1a1a1a]">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full pl-10 pr-4 py-3 bg-white border border-[#e8e2d9] rounded-lg text-[#1a1a1a] placeholder-[#8b8378] focus:outline-none focus:border-[#3d5a3d] focus:ring-2 focus:ring-[#3d5a3d]/10 transition-all"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-[#1a1a1a]">
            Mật khẩu
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              className="w-full pl-10 pr-12 py-3 bg-white border border-[#e8e2d9] rounded-lg text-[#1a1a1a] placeholder-[#8b8378] focus:outline-none focus:border-[#3d5a3d] focus:ring-2 focus:ring-[#3d5a3d]/10 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8378] hover:text-[#1a1a1a]"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Password rules */}
        {password.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <RuleItem ok={pwRules.length} label="Tối thiểu 8 ký tự" />
            <RuleItem ok={pwRules.hasLetter} label="Có chữ cái" />
            <RuleItem ok={pwRules.hasNumber} label="Có số" />
            <RuleItem ok={pwRules.matches} label="Khớp xác nhận" />
          </div>
        )}

        {/* Confirm password */}
        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-[#1a1a1a]">
            Xác nhận mật khẩu
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              className="w-full pl-10 pr-4 py-3 bg-white border border-[#e8e2d9] rounded-lg text-[#1a1a1a] placeholder-[#8b8378] focus:outline-none focus:border-[#3d5a3d] focus:ring-2 focus:ring-[#3d5a3d]/10 transition-all"
            />
          </div>
        </div>

        {/* Terms */}
        <div className="flex items-start gap-2">
          <input
            id="terms"
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-[#e8e2d9] text-[#3d5a3d] focus:ring-[#3d5a3d]"
          />
          <label htmlFor="terms" className="text-sm text-[#6b6b6b]">
            Tôi đồng ý với{" "}
            <Link href="#" className="text-[#3d5a3d] hover:underline">
              Điều khoản sử dụng
            </Link>{" "}
            và{" "}
            <Link href="#" className="text-[#3d5a3d] hover:underline">
              Chính sách bảo mật
            </Link>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-12 text-base"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Tạo tài khoản"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-[#6b6b6b]">
        Đã có tài khoản?{" "}
        <Link href="/auth/login" className="font-medium text-[#3d5a3d] hover:text-[#c4785a]">
          Đăng nhập ngay
        </Link>
      </p>
    </AuthLayout>
  )
}

function RuleItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${ok ? "text-[#3d5a3d]" : "text-[#8b8378]"}`}>
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center ${
          ok ? "bg-[#3d5a3d]" : "bg-[#e8e2d9]"
        }`}
      >
        {ok && <Check className="w-3 h-3 text-white" />}
      </div>
      <span>{label}</span>
    </div>
  )
}
