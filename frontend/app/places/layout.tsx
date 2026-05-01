import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Khám Phá Địa Điểm | TripCompass",
  description: "Khám phá hàng nghìn địa điểm tham quan, ẩm thực và lưu trú tuyệt vời khắp Việt Nam. Tìm kiếm và lọc theo thành phố, loại hình và đánh giá.",
  openGraph: {
    title: "Khám Phá Địa Điểm | TripCompass",
    description: "Hàng nghìn quán ăn, điểm tham quan và nơi lưu trú được tuyển chọn khắp Việt Nam.",
    type: "website",
  },
};

export default function PlacesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
