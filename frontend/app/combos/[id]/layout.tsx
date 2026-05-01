import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chi Tiết Combo Du Lịch | TripCompass",
  description: "Xem chi tiết combo du lịch trọn gói, danh sách địa điểm, giá và cách đặt tour tại TripCompass.",
  openGraph: {
    type: "website",
  },
};

export default function ComboDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
