import Link from "next/link"
import { Mail, MapPin } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />
      <section className="pt-28 pb-16 lg:pt-36">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c4785a]">Liên hệ</p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1a1a1a] sm:text-5xl">
            Kết nối với TripCompass
          </h1>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#e8e2d9] bg-white p-5">
              <Mail className="mb-3 h-5 w-5 text-[#3d5a3d]" />
              <p className="font-medium text-[#1a1a1a]">Email hỗ trợ</p>
              <p className="mt-1 text-sm text-[#6b6b6b]">support@tripcompass.vn</p>
            </div>
            <div className="rounded-2xl border border-[#e8e2d9] bg-white p-5">
              <MapPin className="mb-3 h-5 w-5 text-[#3d5a3d]" />
              <p className="font-medium text-[#1a1a1a]">Khu vực phục vụ</p>
              <p className="mt-1 text-sm text-[#6b6b6b]">Du lịch nội địa Việt Nam</p>
            </div>
          </div>
          <Button asChild variant="outline" className="mt-8 rounded-full border-[#3d5a3d] text-[#3d5a3d]">
            <Link href="/planner">Quay lại lịch trình</Link>
          </Button>
        </div>
      </section>
      <Footer />
    </main>
  )
}
