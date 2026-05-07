import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Combo Du Lịch Việt Nam | TripCompass",
  description: "Khám phá các combo du lịch trọn gói tốt nhất tại Việt Nam. Tiết kiệm chi phí với các gói tham quan + ăn uống + lưu trú được tuyển chọn kỹ lưỡng.",
  openGraph: {
    title: "Combo Du Lịch Việt Nam | TripCompass",
    description: "Các combo du lịch trọn gói tốt nhất tại Việt Nam — tiết kiệm và tiện lợi.",
    type: "website",
  },
};

export default function CombosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
