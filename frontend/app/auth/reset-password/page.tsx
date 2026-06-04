"use client"

// /auth/reset-password?token=... — Consumes the link the user got via email.
// Requires the token query param; surfaces backend validation errors
// verbatim (expired link, invalid token, password too short) so the user can
// recover instead of staring at a generic "failed".

import { Suspense, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock } from "lucide-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"

const MIN_PASSWORD_LENGTH = 8
const PASSWORD_HAS_LETTER_AND_NUMBER = /^(?=.*[A-Za-z])(?=.*\d)/

function ResetPasswordContent() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token") || ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Missing-token branch: typically reached if the user lands here directly
  // without an email link. Don't show the form — would just fail server-side.
  if (!token) {
    return (
      <AuthLayout title="Liên kết không hợp lệ" subtitle="Yêu cầu đặt lại mật khẩu cần được mở từ email">
        <div className="flex flex-col items-center py-6">
          <div className="w-16 h-16 rounded-full bg-[#c94a4a]/10 flex items-center justify-center mb-5">
            <AlertCircle className="w-9 h-9 text-[#c94a4a]" />
          </div>
          <p className="text-sm text-[#6b6b6b] text-center mb-6 max-w-sm">
            Liên kết bạn vừa mở thiếu mã token. Vui lòng yêu cầu link đặt lại mật khẩu mới.
          </p>
          <Button asChild className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white w-full h-12">
            <Link href="/auth/forgot-password">Yêu cầu link mới</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`)
      return
    }
    if (!PASSWORD_HAS_LETTER_AND_NUMBER.test(password)) {
      setError("Mật khẩu phải bao gồm chữ và số")
      return
    }
    if (password !== confirm) {
      setError("Mật khẩu xác nhận không khớp")
      return
    }

    setLoading(true)
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: { token, new_password: password },
        auth: false,
      })
      setDone(true)
      // Soft redirect to login after a moment so the user sees the confirmation.
      setTimeout(() => router.replace("/auth/login"), 1800)
    } catch (e) {
      // Backend surfaces expired/invalid/too-short via ErrInvalidInput → 400.
      // Show whatever message it sent so the user can act (request new link).
      const msg = e instanceof ApiError && e.message
        ? e.message
        : "Không thể đặt lại mật khẩu. Vui lòng thử lại."
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Đã đặt lại mật khẩu" subtitle="Đang chuyển bạn về trang đăng nhập...">
        <div className="flex flex-col items-center py-6">
          <div className="w-20 h-20 rounded-full bg-[#3d5a3d]/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-[#3d5a3d]" />
          </div>
          <p className="text-[#6b6b6b] text-center mb-6 max-w-sm">
            Mật khẩu đã được cập nhật. Bạn có thể đăng nhập với mật khẩu mới ngay bây giờ.
          </p>
          <Button asChild className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white w-full h-12">
            <Link href="/auth/login">Tới trang đăng nhập</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Đặt mật khẩu mới" subtitle="Chọn một mật khẩu bạn sẽ nhớ">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#1a1a1a] mb-1.5">
            Mật khẩu mới
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`Ít nhất ${MIN_PASSWORD_LENGTH} ký tự`}
              className="w-full h-11 pl-10 pr-4 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm focus:outline-none focus:border-[#3d5a3d]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-[#1a1a1a] mb-1.5">
            Xác nhận mật khẩu
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              className="w-full h-11 pl-10 pr-4 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm focus:outline-none focus:border-[#3d5a3d]"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-[#c94a4a]/10 border border-[#c94a4a]/20 rounded-lg text-sm text-[#c94a4a]">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Cập nhật mật khẩu
        </Button>

        <Link
          href="/auth/login"
          className="flex items-center justify-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#1a1a1a]"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay về đăng nhập
        </Link>
      </form>
    </AuthLayout>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  )
}
