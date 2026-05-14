"use client"

import type React from "react"

import { useState, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff, Facebook, Loader2, Mail, Lock } from "lucide-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { useGoogleOAuthReady } from "@/components/app-providers"
import { useAuth } from "@/hooks/use-auth"
import { ApiError } from "@/lib/api"
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google"

const OAUTH_BUTTON_WIDTH = 400

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, loginGoogle } = useAuth()
  const googleEnabled = useGoogleOAuthReady()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const redirectTo = searchParams.get("redirect") || "/"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(email, password)
      window.location.href = redirectTo
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

  // Google OAuth — credential flow (id_token JWT, required by backend /auth/google)
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return
    try {
      await loginGoogle(credentialResponse.credential) // ✅ id_token, not access_token
      window.location.href = redirectTo
    } catch {
      setError("Google đăng nhập thất bại. Thử lại sau.")
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
      <div className="mx-auto w-full max-w-[400px] space-y-3">
        {/* Google — uses GoogleLogin component which passes id_token (credential) */}
        <div className="w-full overflow-hidden rounded-lg [&>div]:!w-full [&_iframe]:!w-full">
          {googleEnabled ? (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Google đăng nhập bị huỷ.")}
              text="signin_with"
              theme="outline"
              size="large"
              shape="rectangular"
              logo_alignment="left"
              width={OAUTH_BUTTON_WIDTH}
              containerProps={{ className: "w-full" }}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled
              className='relative h-[40px] w-full justify-center rounded-[4px] border-[#dadce0] bg-white text-[#8b8378] shadow-none font-["Roboto","Helvetica_Neue",Arial,sans-serif] text-sm font-medium'
            >
              Đăng nhập bằng Google
            </Button>
          )}
        </div>
        {/* Facebook — UI only, SDK deferred. Sized to match the Google iframe (size="large"). */}
        <Button
          type="button"
          variant="outline"
          className='relative h-[40px] w-full justify-center rounded-[4px] border-[#dadce0] bg-white px-3 text-[#3c4043] shadow-none hover:bg-[#f8fafd] hover:text-[#3c4043] font-["Roboto","Helvetica_Neue",Arial,sans-serif] text-sm font-medium'
        >
          <Facebook className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 fill-[#1877F2] text-[#1877F2]" />
          <span>Tiếp tục với Facebook</span>
        </Button>
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
