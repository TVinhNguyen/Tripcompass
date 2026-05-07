"use client";

import dynamic from "next/dynamic";
import type { MapActivity } from "./itinerary-map";

interface Props {
  activities: MapActivity[];
  activeActivityId?: string | null;
  onMarkerClick?: (activityId: string) => void;
}

// react-leaflet uses window on import - must be client-only
const ItineraryMap = dynamic(() => import("./itinerary-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#eeeae1]">
      <div className="text-[11px] font-mono tracking-[0.2em] uppercase text-[#6b6b6b]">
        Đang tải bản đồ…
      </div>
    </div>
  ),
});

export default function ItineraryMapDynamic(props: Props) {
  return <ItineraryMap {...props} />;
}
