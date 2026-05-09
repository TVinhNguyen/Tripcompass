import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lịch Trình Du Lịch Công Khai | TripCompass",
  description: "Xem lịch trình du lịch Việt Nam được chia sẻ. Sao chép về tài khoản và tùy chỉnh theo nhu cầu của bạn.",
  openGraph: {
    type: "website",
  },
};

export default function PublicItineraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
