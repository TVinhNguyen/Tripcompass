"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react"
import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: { email },
        auth: false,
      })
    } catch {
      // Always show success — don't leak whether email exists
    } finally {
      setLoading(false)
      setSent(true)
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Đã gửi email" subtitle={`Kiểm tra hộp thư ${email} để nhận link đặt lại mật khẩu`}>
        <div className="flex flex-col items-center py-6">
          <div className="w-20 h-20 rounded-full bg-[#3d5a3d]/10 flex items-center justify-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-[#3d5a3d]" />
          </div>
          <p className="text-[#6b6b6b] text-center mb-8 max-w-sm">
            Nếu email này tồn tại trong hệ thống, bạn sẽ nhận được link đặt lại mật khẩu trong vòng vài phút.
          </p>
          <Button asChild className="bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white w-full h-12">
            <Link href="/auth/login">Quay về đăng nhập</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Quên mật khẩu?" subtitle="Nhập email để chúng tôi gửi link đặt lại mật khẩu">
      <form onSubmit={handleSubmit} className="space-y-5">
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

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white h-12 text-base"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Gửi link đặt lại"}
        </Button>

        <Link
          href="/auth/login"
          className="flex items-center justify-center gap-1 text-sm text-[#6b6b6b] hover:text-[#1a1a1a]"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại đăng nhập
        </Link>
      </form>
    </AuthLayout>
  )
}
