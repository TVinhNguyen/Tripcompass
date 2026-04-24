"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"
import { Suspense } from "react"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const redirectTo = searchParams.get("redirect") || "/planner"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(email, password)
      router.push(redirectTo)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError("Email hoặc mật khẩu không đúng.")
        else if (err.status === 403) setError("Tài khoản chưa được xác thực. Vui lòng kiểm tra email.")
        else setError(err.message || "Đăng nhập thất bại.")
      } else {
        setError("Không thể kết nối server. Thử lại sau.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để tiếp tục hành trình khám phá của bạn"
      quote={{
        text: "Hành trình ngàn dặm bắt đầu từ một bước chân – và một kế hoạch tốt.",
        author: "Lão Tử",
      }}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
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
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-[#1a1a1a]">
              Mật khẩu
            </label>
            <Link href="/auth/forgot-password" className="text-sm text-[#c4785a] hover:text-[#3d5a3d]">
              Quên mật khẩu?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
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

        {/* Remember me */}
        <div className="flex items-center">
          <input
            id="remember"
            type="checkbox"
            className="w-4 h-4 rounded border-[#e8e2d9] text-[#3d5a3d] focus:ring-[#3d5a3d]"
          />
          <label htmlFor="remember" className="ml-2 text-sm text-[#6b6b6b]">
            Ghi nhớ đăng nhập
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-12 text-base"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Đăng nhập"}
        </Button>
      </form>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#e8e2d9]" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-3 bg-[#f5f0e8] text-[#8b8378]">Hoặc tiếp tục với</span>
        </div>
      </div>

      {/* OAuth buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#e8e2d9] rounded-lg hover:bg-[#f5f0e8] transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="text-sm font-medium text-[#1a1a1a]">Google</span>
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#e8e2d9] rounded-lg hover:bg-[#f5f0e8] transition-colors"
        >
          <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          <span className="text-sm font-medium text-[#1a1a1a]">Facebook</span>
        </button>
      </div>

      {/* Sign up link */}
      <p className="mt-8 text-center text-sm text-[#6b6b6b]">
        Chưa có tài khoản?{" "}
        <Link href="/auth/register" className="font-medium text-[#3d5a3d] hover:text-[#c4785a]">
          Đăng ký miễn phí
        </Link>
      </p>
    </AuthLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
