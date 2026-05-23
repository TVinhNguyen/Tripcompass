import { ArticleLayout } from "../_components/article-layout"

export const metadata = {
  title: "Lên kế hoạch với AI | TripCompass",
}

export default function AiPlannerHelpPage() {
  return (
    <ArticleLayout
      eyebrow="Trọng điểm"
      title="Lên kế hoạch với AI"
      intro="Trợ lý AI hiểu tiếng Việt tự nhiên và biết về các điểm du lịch Việt Nam. Mô tả càng cụ thể, gợi ý càng sát ý bạn."
      next={{ href: "/help/itinerary-edit", title: "Sửa lịch trình" }}
    >
      <h2>Mô tả chuyến đi thế nào?</h2>
      <p>
        Càng nhiều thông tin, AI càng đỡ phải hỏi lại. Một mô tả tốt có 4 yếu tố:
      </p>
      <ul>
        <li><strong>Điểm đến</strong>: ví dụ "Đà Nẵng", "Hội An", "Sapa".</li>
        <li><strong>Thời gian</strong>: số ngày hoặc khoảng ngày — "3 ngày tháng 9".</li>
        <li><strong>Người đi + ngân sách</strong>: "2 người, ngân sách 5 triệu".</li>
        <li><strong>Sở thích</strong>: "biển, ăn uống, ít đi bộ" — bao nhiêu cũng được.</li>
      </ul>

      <div className="tip">
        <strong>Ví dụ một câu đủ thông tin:</strong> "Đi Đà Nẵng 3 ngày 2 đêm,
        2 người, ngân sách 5 triệu, thích biển và ẩm thực địa phương, không đi bộ nhiều."
      </div>

      <h2>Hai chế độ — AI Chat và Tạo nhanh</h2>
      <p>
        <strong>AI Chat</strong> là cuộc trò chuyện nhiều lượt. Bạn có thể vừa hỏi vừa
        điều chỉnh: "đổi sang đi biển", "tăng ngân sách lên 7 triệu", "thay nhà hàng tối thứ 2".
        AI sẽ cập nhật và giải thích lựa chọn.
      </p>
      <p>
        <strong>Tạo nhanh</strong> là form điền 1 lần. Nhanh hơn nhưng kém linh hoạt —
        nếu kết quả chưa ưng, bạn sửa trực tiếp trong lịch trình.
      </p>

      <h2>Khi AI gợi ý chưa đúng</h2>
      <ul>
        <li>
          <strong>Yêu cầu cụ thể</strong> trong chat: "phải có Cầu Vàng", "thêm bún chả cá ngày 2".
          AI sẽ tính lại lịch trình giữ nguyên những yêu cầu này.
        </li>
        <li>
          <strong>Lưu lịch trình</strong> rồi tự chỉnh — đôi khi sửa tay nhanh hơn debate với AI.
        </li>
        <li>
          <strong>Hỏi lại lý do</strong>: "tại sao chọn nhà hàng X?" — AI sẽ giải thích
          dựa trên đánh giá, khoảng cách, giờ mở cửa.
        </li>
      </ul>

      <h2>AI có truy cập gì?</h2>
      <p>
        AI tham khảo kho dữ liệu địa điểm đã được biên tập của TripCompass, kết hợp
        với các nguồn cập nhật trên web khi cần (vd: sự kiện theo mùa, giá vé real-time).
        Nếu thiếu thông tin, AI sẽ nói rõ thay vì đoán.
      </p>
    </ArticleLayout>
  )
}
