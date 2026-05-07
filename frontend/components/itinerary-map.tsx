"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// MapActivity — a minimal shape expected by ItineraryMap.
// The edit page's local Activity is assignment-compatible with this.
export type MapActivity = {
  id: string;
  day: number;
  time: string;
  title: string;
  location: string;
  cost?: number | null;
  lat?: number | null;
  lng?: number | null;
};

// Override default icon paths (Leaflet webpack/Next issue)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Theme-aligned day colors
const DAY_COLORS = [
  "#3d5a3d", // olive
  "#c4785a", // terracotta
  "#d4a853", // gold
  "#5a7a5a", // olive light
  "#8b8378", // stone
  "#1a1a1a", // charcoal
];

function dayColor(day: number) {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}

function createNumberIcon(num: number, color: string, active: boolean) {
  const size = active ? 40 : 32;
  return L.divIcon({
    className: "itinerary-marker",
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        transform:translate(-50%,-100%);
        position:relative;
      ">
        <div style="
          width:100%;
          height:100%;
          background:${color};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 4px 12px rgba(0,0,0,0.25);
          border:2px solid #f5f0e8;
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          <span style="
            transform:rotate(45deg);
            color:#f5f0e8;
            font-family:'JetBrains Mono',monospace;
            font-size:${active ? 14 : 12}px;
            font-weight:600;
            letter-spacing:0.02em;
          ">${num}</span>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

type ActivityWithIndex = MapActivity & { indexInDay: number };

function FitBounds({ activities }: { activities: MapActivity[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = activities.filter((a) => a.lat != null && a.lng != null);
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView([valid[0].lat!, valid[0].lng!], 14);
      return;
    }
    const bounds = L.latLngBounds(valid.map((a) => [a.lat!, a.lng!] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
  }, [activities, map]);
  return null;
}

function FlyToActive({ activity }: { activity: MapActivity | null }) {
  const map = useMap();
  useEffect(() => {
    if (activity && activity.lat != null && activity.lng != null) {
      map.flyTo([activity.lat, activity.lng], 16, { duration: 0.6 });
    }
  }, [activity, map]);
  return null;
}

interface ItineraryMapProps {
  activities: MapActivity[];
  activeActivityId?: string | null;
  onMarkerClick?: (activityId: string) => void;
}

export default function ItineraryMap({
  activities,
  activeActivityId,
  onMarkerClick,
}: ItineraryMapProps) {
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  const withCoords = useMemo(() => {
    const sorted = [...activities]
      .filter((a) => a.lat != null && a.lng != null)
      .sort((a, b) => {
        if (a.day !== b.day) return a.day - b.day;
        return a.time.localeCompare(b.time);
      });
    // Assign indexInDay (1-based) for numbered markers
    const perDay: Record<number, number> = {};
    return sorted.map<ActivityWithIndex>((a) => {
      perDay[a.day] = (perDay[a.day] || 0) + 1;
      return { ...a, indexInDay: perDay[a.day] };
    });
  }, [activities]);

  // Group by day for polylines
  const polylinesByDay = useMemo(() => {
    const result: Record<number, [number, number][]> = {};
    for (const a of withCoords) {
      if (!result[a.day]) result[a.day] = [];
      result[a.day].push([a.lat!, a.lng!]);
    }
    return result;
  }, [withCoords]);

  const activeActivity = activeActivityId
    ? withCoords.find((a) => a.id === activeActivityId) || null
    : null;

  // Auto-open popup when active changes
  useEffect(() => {
    if (activeActivityId && markerRefs.current[activeActivityId]) {
      markerRefs.current[activeActivityId]?.openPopup();
    }
  }, [activeActivityId]);

  // Fallback center: Hanoi
  const defaultCenter: [number, number] =
    withCoords.length > 0 ? [withCoords[0].lat!, withCoords[0].lng!] : [21.0285, 105.8542];

  if (withCoords.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#eeeae1]">
        <div className="text-center text-[#6b6b6b] px-6">
          <div className="text-[11px] font-mono tracking-[0.2em] uppercase mb-2">No locations</div>
          <div className="text-sm">Thêm tọa độ cho hoạt động để xem trên bản đồ</div>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      scrollWheelZoom
      className="w-full h-full z-0"
      style={{ background: "#eeeae1" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      <FitBounds activities={withCoords} />
      <FlyToActive activity={activeActivity} />

      {/* Polylines per day */}
      {Object.entries(polylinesByDay).map(([day, coords]) => (
        <Polyline
          key={`line-${day}`}
          positions={coords}
          pathOptions={{
            color: dayColor(Number(day)),
            weight: 3,
            opacity: 0.7,
            dashArray: "6 8",
          }}
        />
      ))}

      {/* Markers */}
      {withCoords.map((a) => {
        const active = a.id === activeActivityId;
        return (
          <Marker
            key={a.id}
            position={[a.lat!, a.lng!]}
            icon={createNumberIcon(a.indexInDay, dayColor(a.day), active)}
            ref={(ref) => {
              markerRefs.current[a.id] = ref;
            }}
            eventHandlers={{
              click: () => onMarkerClick?.(a.id),
            }}
          >
            <Popup closeButton={false} className="itinerary-popup">
              <div className="min-w-[200px]">
                <div
                  className="text-[10px] font-mono tracking-[0.2em] uppercase mb-1"
                  style={{ color: dayColor(a.day) }}
                >
                  Day {String(a.day).padStart(2, "0")} · {a.time}
                </div>
                <div className="text-sm font-semibold text-[#1a1a1a] leading-snug">
                  {a.title}
                </div>
                <div className="text-xs text-[#6b6b6b] mt-1">{a.location}</div>
                {a.cost != null && a.cost > 0 && (
                  <div className="text-xs font-mono tabular-nums text-[#1a1a1a] mt-2">
                    {a.cost.toLocaleString("vi-VN")} ₫
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
