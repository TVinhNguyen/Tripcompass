import { ArticleLayout } from "../_components/article-layout"

export const metadata = {
  title: "Lưu địa điểm yêu thích | TripCompass",
}

export default function SavedPlacesHelpPage() {
  return (
    <ArticleLayout
      eyebrow="Tổ chức"
      title="Lưu địa điểm yêu thích"
      intro="Đánh dấu nhà hàng, điểm đến, khách sạn để tra cứu nhanh và đưa vào lịch trình sau."
      next={{ href: "/help/sharing", title: "Chia sẻ với bạn bè" }}
    >
      <h2>Lưu địa điểm</h2>
      <p>
        Trên thẻ địa điểm (ở trang khám phá hoặc tìm kiếm), bấm icon trái tim ở góc
        trên bên phải. Tim chuyển sang màu cam đất nghĩa là đã lưu. Bấm lại để bỏ.
      </p>

      <div className="tip">
        <strong>Đồng bộ tức thì:</strong> địa điểm lưu xuất hiện ngay trong{" "}
        <strong>Hồ sơ → Đã lưu</strong>, không cần refresh trang.
      </div>

      <h2>Dùng địa điểm đã lưu</h2>
      <p>Có 2 cách:</p>
      <ul>
        <li>
          <strong>Vào trang chi tiết</strong> từ tab "Đã lưu" — xem địa chỉ, giờ mở
          cửa, giá, đánh giá. Dùng để quyết định nhanh khi đang lên kế hoạch.
        </li>
        <li>
          <strong>Đề cập trong AI Chat</strong>: "thêm Mì Quảng Bà Mua vào ngày 2" —
          AI biết bạn đang nói về địa điểm trong kho dữ liệu, sẽ chèn đúng.
        </li>
      </ul>

      <h2>Khác gì với danh sách wish-list?</h2>
      <p>
        Lưu địa điểm khác với lưu lịch trình. Lưu địa điểm = đánh dấu 1 điểm cụ thể
        để tham khảo. Lưu lịch trình = giữ cả chuyến đi hoàn chỉnh đã sắp xếp.
        Hai khái niệm tách biệt — bạn có thể dùng cả hai song song.
      </p>

      <h2>Có giới hạn không?</h2>
      <p>
        Hiện chưa giới hạn số lượng địa điểm lưu. Khi danh sách dài, dùng ô tìm kiếm
        trong tab "Đã lưu" để lọc theo tên hoặc loại (ăn uống / tham quan / lưu trú).
      </p>
    </ArticleLayout>
  )
}
