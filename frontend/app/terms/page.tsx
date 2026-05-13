import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />
      <section className="pt-28 pb-16 lg:pt-36">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#c4785a]">Điều khoản</p>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-[#1a1a1a] sm:text-5xl">
            Điều khoản sử dụng
          </h1>
          <div className="mt-8 space-y-4 text-[#4f4a43]">
            <p>TripCompass hỗ trợ lập lịch trình tham khảo; người dùng cần tự kiểm tra giờ mở cửa, giá và điều kiện thực tế trước chuyến đi.</p>
            <p>Bạn chịu trách nhiệm với nội dung lịch trình mình tạo, chỉnh sửa và chia sẻ công khai.</p>
            <p>Chúng tôi có thể cập nhật điều khoản khi sản phẩm thêm tính năng hoặc tích hợp mới.</p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  )
}
