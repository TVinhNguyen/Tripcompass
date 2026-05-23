import { ArticleLayout } from "../_components/article-layout"

export const metadata = {
  title: "Bắt đầu trong 3 phút | TripCompass",
}

export default function QuickstartPage() {
  return (
    <ArticleLayout
      eyebrow="Mới bắt đầu"
      title="Bắt đầu trong 3 phút"
      intro="Bạn vừa tạo tài khoản. Đây là cách đi nhanh nhất từ trang chủ đến lịch trình đầu tiên — chọn 1 trong 3 đường tuỳ ý."
      next={{ href: "/help/ai-planner", title: "Lên kế hoạch với AI" }}
    >
      <h2>3 cách tạo lịch trình</h2>
      <p>
        TripCompass có ba lối vào, phù hợp với mức độ chi tiết bạn muốn cung cấp:
      </p>
      <ol>
        <li>
          <strong>AI Chat</strong> — mô tả chuyến đi tự nhiên rồi để trợ lý AI hỏi lại
          và lên kế hoạch. Phù hợp nếu chưa rõ điểm đến hoặc muốn brainstorm.
        </li>
        <li>
          <strong>Tạo nhanh</strong> — form ngắn: điểm đến, số ngày, ngân sách, sở thích.
          AI tự sắp xếp. Phù hợp khi đã biết đi đâu, chỉ cần lịch trình mẫu.
        </li>
        <li>
          <strong>Tự tạo</strong> — bắt đầu với lịch trình rỗng, kéo thả hoạt động
          từ thư viện. Phù hợp khi bạn đã có khung sườn và muốn kiểm soát chi tiết.
        </li>
      </ol>

      <div className="tip">
        <strong>Gợi ý:</strong> Lần đầu nên thử AI Chat — chỉ cần một câu như
        "Đi Đà Nẵng 3 ngày 2 đêm cho 2 người, ngân sách 5 triệu" là đủ.
      </div>

      <h2>Sau khi có lịch trình</h2>
      <p>Mỗi lịch trình đều có thể:</p>
      <ul>
        <li>Chỉnh sửa: kéo thả hoạt động, sửa giờ, thêm ghi chú, autosave.</li>
        <li>Lưu địa điểm bạn thích để dùng cho chuyến sau.</li>
        <li>Xuất bản (Publish) để tạo link chia sẻ công khai.</li>
        <li>Nhân bản (Clone) khi muốn dựa trên 1 lịch trình có sẵn.</li>
      </ul>

      <h2>Khi nào cần Combo?</h2>
      <p>
        Combo là gói du lịch trọn gói từ nhà cung cấp (vé + khách sạn + dịch vụ).
        Vào trang <strong>Combo</strong> nếu bạn muốn book luôn, không cần tự ghép.
        Lịch trình tự tạo và Combo độc lập với nhau — chọn theo nhu cầu.
      </p>
    </ArticleLayout>
  )
}
