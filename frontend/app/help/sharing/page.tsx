import { ArticleLayout } from "../_components/article-layout"

export const metadata = {
  title: "Chia sẻ với bạn bè | TripCompass",
}

export default function SharingHelpPage() {
  return (
    <ArticleLayout
      eyebrow="Chia sẻ"
      title="Chia sẻ lịch trình với bạn bè"
      intro="Xuất bản để tạo link công khai, hoặc mời cộng tác để cùng chỉnh sửa realtime."
    >
      <h2>Hai cách chia sẻ</h2>
      <p>Tùy mục đích:</p>
      <ul>
        <li>
          <strong>Xuất bản (Publish)</strong>: tạo link công khai, ai mở cũng xem
          được nhưng không sửa được. Phù hợp khi chỉ muốn show off.
        </li>
        <li>
          <strong>Mời cộng tác</strong>: thêm người vào với quyền chỉnh sửa.
          Họ phải có tài khoản TripCompass.
        </li>
      </ul>

      <h2>Xuất bản lịch trình</h2>
      <p>
        Trong trang chi tiết lịch trình, nhấn nút <strong>Xuất bản</strong>. Trạng
        thái đổi từ "Bản nháp" sang "Đã xuất bản". Lúc này nút <strong>Chia sẻ</strong>
        sẽ hiện — bấm để copy link dạng <code>tripcompass.studio/itinerary/[id]/public</code>.
      </p>

      <div className="tip">
        <strong>Lưu ý:</strong> link công khai chỉ hoạt động khi đã xuất bản. Trước
        khi xuất bản, link sẽ trả lỗi 404 nếu người khác mở.
      </div>

      <h2>Bỏ xuất bản</h2>
      <p>
        Quay lại "Bản nháp" bằng cách nhấn lại nút trạng thái. Link cũ sẽ ngừng hoạt
        động ngay. Người đã copy link sẽ thấy 404 — không leak thông tin sau đó.
      </p>

      <h2>Mời cộng tác</h2>
      <p>Trong trang chi tiết, mở menu <strong>Cộng tác</strong>:</p>
      <ol>
        <li>Nhập email người muốn mời.</li>
        <li>Chọn quyền: <strong>Biên tập</strong> (sửa được) hoặc <strong>Xem</strong> (đọc).</li>
        <li>Gửi lời mời.</li>
      </ol>
      <p>
        Người được mời nhận thông báo trong tài khoản TripCompass của họ. Khi họ
        chấp nhận, mọi thay đổi sẽ đồng bộ realtime giữa các tab đang mở.
      </p>

      <h2>Nhân bản (Clone)</h2>
      <p>
        Khi xem lịch trình của người khác (đã xuất bản), bạn có thể bấm{" "}
        <strong>Nhân bản</strong> để copy vào tài khoản mình rồi tùy biến lại.
        Bản gốc không bị ảnh hưởng.
      </p>
    </ArticleLayout>
  )
}
