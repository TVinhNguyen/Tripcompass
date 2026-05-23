"use client";

import { useAuth } from "@/hooks/use-auth";
import { OnboardingTour } from "@/components/onboarding-tour";

export function LandingTour() {
  const { user, loading } = useAuth();

  if (loading || !user) return null;

  return (
    <OnboardingTour
      storageKey={`tour_landing_${user.id}`}
      enabled
      steps={[
        {
          target: '[data-tour="landing-features"]',
          title: "TripCompass có gì cho bạn?",
          body:
            "Bốn năng lực cốt lõi: hiểu ý định chuyến đi, sắp lịch theo ngày, ước tính chi phí, lưu và chia sẻ. Sẵn sàng thử chưa?",
          preferredPlacement: "top",
          cta: { label: "Bắt đầu lên kế hoạch", href: "/planner" },
        },
      ]}
    />
  );
}
