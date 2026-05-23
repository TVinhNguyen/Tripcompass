// =============================================================================
// /help — Help center landing.
//
// Replaces the previous single-page list with a cards-driven layout that
// new users can scan to find the article matching their question. Each
// card links to a dedicated article page so search engines / shared links
// land on a deep page, not a hash anchor.
// =============================================================================

import Link from "next/link"
import {
  Sparkles, MapPin, Calendar, Heart, Share2, Compass, ArrowRight, MessageCircle,
} from "lucide-react"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

const articles = [
  {
    href: "/help/quickstart",
    icon: Compass,
    title: "Bắt đầu trong 3 phút",
    summary: "Đi từ đăng ký đến khi có lịch trình đầu tiên — 3 cách chính, chọn cái phù hợp.",
    badge: "Mới bắt đầu",
  },
  {
    href: "/help/ai-planner",
    icon: Sparkles,
    title: "Lên kế hoạch với AI",
    summary: "Trợ lý AI hiểu tiếng Việt tự nhiên. Cách mô tả chuyến đi để AI gợi ý sát ý.",
    badge: "Trọng điểm",
  },
  {
    href: "/help/itinerary-edit",
    icon: Calendar,
    title: "Sửa lịch trình",
    summary: "Kéo thả hoạt động giữa các ngày, tự động lưu, chỉnh giờ và chi phí.",
  },
  {
    href: "/help/saved-places",
    icon: Heart,
    title: "Lưu địa điểm yêu thích",
    summary: "Đánh dấu nhà hàng, điểm đến để dùng lại trong các lịch trình sau.",
  },
  {
    href: "/help/sharing",
    icon: Share2,
    title: "Chia sẻ với bạn bè",
    summary: "Xuất bản lịch trình và tạo link chia sẻ công khai. Cộng tác chỉnh sửa realtime.",
  },
]

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      <section className="pt-28 pb-10 lg:pt-36 lg:pb-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c4785a]">
            Hỗ trợ
          </p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1a1a1a] sm:text-5xl">
            Trung tâm hỗ trợ
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#6b6b6b]">
            Hướng dẫn ngắn gọn cho người mới dùng TripCompass. Đọc xong bài
            Bắt đầu trong 3 phút là có thể tự tạo lịch trình đầu tiên.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {articles.map((a) => {
              const Icon = a.icon
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group relative flex flex-col rounded-2xl border border-[#e8e2d9] bg-white p-6 transition-all hover:border-[#3d5a3d]/40 hover:shadow-md"
                >
                  {a.badge && (
                    <span className="absolute right-4 top-4 rounded-full bg-[#d4a853]/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#8b6f47]">
                      {a.badge}
                    </span>
                  )}
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#3d5a3d]/10 text-[#3d5a3d]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold tracking-tight text-[#1a1a1a]">
                    {a.title}
                  </h3>
                  <p className="flex-1 text-sm leading-relaxed text-[#6b6b6b]">{a.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#3d5a3d] transition-colors group-hover:text-[#2d4a2d]">
                    Đọc bài
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              )
            })}
          </div>

          <div className="mt-12 rounded-2xl border border-[#e8e2d9] bg-white p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c4785a]/10 text-[#c4785a]">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-[#1a1a1a]">
                  Không tìm thấy câu trả lời?
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-[#6b6b6b]">
                  Trợ lý AI có thể giải đáp thắc mắc về du lịch Việt Nam — kể cả
                  những việc nằm ngoài hướng dẫn này. Hoặc gửi feedback cho đội ngũ TripCompass.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/ai-planner"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#3d5a3d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2d4a2d]"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Hỏi trợ lý AI
                  </Link>
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e2d9] px-4 py-2 text-sm font-medium text-[#1a1a1a] transition-colors hover:border-[#3d5a3d]"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Liên hệ
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
