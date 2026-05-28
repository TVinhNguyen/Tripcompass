"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { OnboardingTour } from "@/components/onboarding-tour";
import { apiFetch } from "@/lib/api";
import type { Itinerary } from "@/lib/types";

export function LandingTour() {
  const { user, loading } = useAuth();
  // null = chưa biết; true = đã có ≥1 itinerary; false = chưa có cái nào.
  // Gate này để user cũ (đã từng dùng sản phẩm) không bị show lại tour khi
  // localStorage trên thiết bị mới chưa có dấu vết. Per-device storageKey vẫn
  // được giữ ở OnboardingTour như tầng gate thứ hai.
  const [hasItineraries, setHasItineraries] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ data: Itinerary[] }>("/itineraries")
      .then((r) => setHasItineraries((r.data ?? []).length > 0))
      // Fail-safe: nếu fetch lỗi, coi như đã có — không bật tour nhầm cho user cũ.
      .catch(() => setHasItineraries(true));
  }, [user]);

  if (loading || !user) return null;
  if (hasItineraries === null) return null;
  if (hasItineraries) return null;

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
