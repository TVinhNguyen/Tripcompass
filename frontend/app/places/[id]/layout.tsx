import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chi Tiết Địa Điểm | TripCompass",
  description: "Xem đánh giá, hình ảnh, giờ mở cửa và giá vé của địa điểm du lịch tại Việt Nam.",
  openGraph: {
    type: "website",
  },
};

export default function PlaceDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
