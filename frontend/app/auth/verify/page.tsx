"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"

function VerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get("email") || ""
  // ?token= is present when user clicks the email link directly
  const tokenParam = searchParams.get("token")

  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [countdown, setCountdown] = useState(60)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Auto-verify if token arrives via URL (email link flow)
  useEffect(() => {
    if (!tokenParam) return
    setLoading(true)
    apiFetch("/auth/verify", { method: "POST", body: { token: tokenParam }, auth: false })
      .then(() => setSuccess(true))
      .catch((err) => {
        const msg = err instanceof ApiError && err.status === 400
          ? "Liên kết xác thực đã hết hạn. Hãy yêu cầu gử lại."
          : "Đã xảy ra lỗi. Vui lòng thử lại."
        setError(msg)
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleChange = (i: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...otp]
    next[i] = value.slice(-1)
    setOtp(next)
    if (value && i < 5) inputRefs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      inputRefs.current[i - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    const next = pasted.split("").concat(Array(6 - pasted.length).fill(""))
    setOtp(next)
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const handleSubmit = async () => {
    const code = otp.join("")
    if (code.length !== 6) return
    setError("")
    setLoading(true)
    try {
      await apiFetch("/auth/verify", { method: "POST", body: { token: code }, auth: false })
      setSuccess(true)
      setTimeout(() => router.push("/auth/login"), 1500)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("Mã xác thực không hợp lệ hoặc đã hết hạn.")
      } else {
        setError("Đã xảy ra lỗi. Vui lòng thử lại.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await apiFetch("/auth/resend-verification", {
        method: "POST", body: { email }, auth: false,
      })
    } finally {
      setResending(false)
      setCountdown(60)
      setOtp(["", "", "", "", "", ""])
      setError("")
    }
  }

  if (success) {
    return (
      <AuthLayout title="Xác thực thành công" subtitle="Đang chuyển đến trang đăng nhập...">
        <div className="flex flex-col items-center py-10">
          <div className="w-20 h-20 rounded-full bg-[#3d5a3d]/10 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-12 h-12 text-[#3d5a3d]" />
          </div>
          <p className="text-[#6b6b6b]">Tài khoản của bạn đã được kích hoạt</p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Xác thực email"
      subtitle={`Mã OTP đã được gửi đến ${email}`}
      image="https://images.unsplash.com/photo-1570366583862-f91883984fde?w=1200"
    >
      <div className="space-y-6">
        {/* Email icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#3d5a3d]/10 flex items-center justify-center">
            <Mail className="w-8 h-8 text-[#3d5a3d]" />
          </div>
        </div>

        {/* OTP inputs */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-[#1a1a1a] block text-center">Nhập mã xác thực 6 số</label>
          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-12 h-14 text-center text-xl font-semibold bg-white border border-[#e8e2d9] rounded-lg text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d] focus:ring-2 focus:ring-[#3d5a3d]/10 transition-all"
              />
            ))}
          </div>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={loading || otp.join("").length !== 6}
          className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-12 text-base"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Xác thực"}
        </Button>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        {/* Resend */}
        <div className="text-center text-sm text-[#6b6b6b]">
          Không nhận được mã?{" "}
          {countdown > 0 ? (
            <span className="text-[#8b8378]">Gửi lại sau {countdown}s</span>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending}
              className="font-medium text-[#3d5a3d] hover:text-[#c4785a] disabled:opacity-50 inline-flex items-center gap-1"
            >
              {resending && <Loader2 className="w-3 h-3 animate-spin" />}
              Gửi lại mã
            </button>
          )}
        </div>

        {/* Back */}
        <Link
          href="/auth/register"
          className="flex items-center justify-center gap-1 text-sm text-[#6b6b6b] hover:text-[#1a1a1a]"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại
        </Link>
      </div>
    </AuthLayout>
  )
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  )
}
