import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Khám Phá Việt Nam | TripCompass",
  description: "Tìm kiếm cảm hứng du lịch cho chuyến đi Việt Nam. Điểm đến hot, lịch trình gợi ý và trải nghiệm không thể bỏ lỡ.",
  openGraph: {
    title: "Khám Phá Việt Nam | TripCompass",
    description: "Tìm kiếm cảm hứng du lịch và lên kế hoạch chuyến đi Việt Nam hoàn hảo.",
    type: "website",
  },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
