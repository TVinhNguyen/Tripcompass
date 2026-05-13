import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />
      <section className="pt-28 pb-16 lg:pt-36">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c4785a]">Bảo mật</p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1a1a1a] sm:text-5xl">
            Chính sách bảo mật
          </h1>
          <div className="mt-8 space-y-4 text-[#4f4a43]">
            <p>TripCompass chỉ sử dụng thông tin tài khoản và lịch trình để vận hành các tính năng bạn chọn.</p>
            <p>Dữ liệu lịch trình riêng tư không được công khai cho đến khi bạn chủ động xuất bản.</p>
            <p>Các tích hợp bên thứ ba, nếu có, chỉ được dùng cho đăng nhập, gửi email hoặc xử lý yêu cầu AI.</p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  )
}
