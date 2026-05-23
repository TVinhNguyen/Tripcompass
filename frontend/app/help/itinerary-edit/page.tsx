import { ArticleLayout } from "../_components/article-layout"

export const metadata = {
  title: "Sửa lịch trình | TripCompass",
}

export default function ItineraryEditHelpPage() {
  return (
    <ArticleLayout
      eyebrow="Sửa lịch trình"
      title="Kéo thả, autosave, cộng tác realtime"
      intro="Trang chỉnh sửa lịch trình thiết kế để thao tác bằng chuột — không cần điền form dài. Mọi thay đổi tự lưu."
      next={{ href: "/help/saved-places", title: "Lưu địa điểm yêu thích" }}
    >
      <h2>Kéo thả hoạt động</h2>
      <p>
        Bên trái là thư viện hoạt động mẫu (ăn sáng, tham quan, di chuyển…). Bên phải
        là lịch trình theo ngày. Kéo từ thư viện thả vào ngày bất kỳ để thêm. Trong
        ngày, kéo lên/xuống để đổi thứ tự. Sang ngày khác, kéo sang khung ngày khác.
      </p>

      <h3>Thêm ngày mới</h3>
      <p>
        Bấm nút <strong>+ Thêm ngày</strong> dưới ngày cuối. Ngày trống sẽ xuất hiện
        sẵn sàng đón hoạt động. Không cần lưu ngày — chỉ tạo khi bạn thả thứ gì vào.
      </p>

      <h2>Autosave</h2>
      <p>
        Tiêu đề lịch trình tự lưu sau 0.8 giây ngừng gõ. Hoạt động lưu ngay sau mỗi
        thao tác kéo/sửa. Nếu mất kết nối tạm thời, thay đổi sẽ rollback và bạn thấy
        thông báo — thao tác lại là được.
      </p>

      <div className="tip">
        <strong>Mẹo:</strong> không cần bấm nút "Lưu". Chỉ cần lưu thủ công khi muốn
        ép cập nhật ngay (vd: trước khi đóng tab quan trọng).
      </div>

      <h2>Sửa chi tiết một hoạt động</h2>
      <p>Click vào hoạt động để mở modal chỉnh sửa:</p>
      <ul>
        <li><strong>Giờ bắt đầu</strong>: nên giữ đúng thứ tự trong ngày.</li>
        <li><strong>Chi phí dự kiến</strong>: cộng dồn vào ngân sách hiển thị ở trên cùng.</li>
        <li><strong>Ghi chú</strong>: ví dụ "đặt trước", "ưu tiên ngồi ngoài trời".</li>
      </ul>

      <h2>Cộng tác realtime</h2>
      <p>
        Khi nhiều người mở cùng 1 lịch trình, mỗi thay đổi sẽ hiển thị ngay trên các
        thiết bị khác. Bạn thấy avatar người đang online ở góc trên cùng. Nếu mất kết
        nối WebSocket, hệ thống tự đồng bộ lại trạng thái khi reconnect.
      </p>

      <h2>Mời người khác chỉnh sửa</h2>
      <p>
        Trong trang lịch trình, mở menu <strong>Cộng tác</strong> để mời theo email.
        Người được mời nhận thông báo, nhấn Chấp nhận là có quyền sửa cùng bạn.
      </p>
    </ArticleLayout>
  )
}
