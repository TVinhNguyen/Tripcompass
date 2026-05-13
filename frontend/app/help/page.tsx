import Link from "next/link"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"

const items = [
  "Tạo lịch trình bằng AI từ trang AI Planner hoặc Tạo nhanh.",
  "Lưu lịch trình để chỉnh sửa hoạt động, thời gian và chi phí.",
  "Xuất bản lịch trình để lấy link chia sẻ công khai.",
]

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />
      <section className="pt-28 pb-16 lg:pt-36">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c4785a]">Hỗ trợ</p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1a1a1a] sm:text-5xl">
            Trung tâm hỗ trợ
          </h1>
          <div className="mt-8 space-y-3">
            {items.map((item) => (
              <div key={item} className="rounded-2xl border border-[#e8e2d9] bg-white p-5 text-[#4f4a43]">
                {item}
              </div>
            ))}
          </div>
          <Button asChild className="mt-8 rounded-full bg-[#3d5a3d] text-white hover:bg-[#2d4a2d]">
            <Link href="/ai-planner">Mở AI Planner</Link>
          </Button>
        </div>
      </section>
      <Footer />
    </main>
  )
}
