import Link from "next/link"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />
      <section className="pt-28 pb-16 lg:pt-36">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c4785a]">Cẩm nang</p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1a1a1a] sm:text-5xl">
            Cẩm nang du lịch đang được cập nhật
          </h1>
          <p className="mt-4 max-w-2xl text-[#6b6b6b]">
            TripCompass sẽ gom các gợi ý theo mùa, lịch trình mẫu và kinh nghiệm địa phương tại đây.
          </p>
          <Button asChild className="mt-8 rounded-full bg-[#3d5a3d] text-white hover:bg-[#2d4a2d]">
            <Link href="/explore">Khám phá lịch trình</Link>
          </Button>
        </div>
      </section>
      <Footer />
    </main>
  )
}
