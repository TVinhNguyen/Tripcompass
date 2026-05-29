"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
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
  coverImage?: string;
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
  destination?: string;
}

export default function ItineraryMap({
  activities,
  activeActivityId,
  onMarkerClick,
  destination,
}: ItineraryMapProps) {
  const markerRefs = useRef<Record<string, L.Marker | null>>({});
  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set());

  const allWithCoords = useMemo(() => {
    const sorted = [...activities]
      .filter((a) => a.lat != null && a.lng != null)
      .sort((a, b) => {
        if (a.day !== b.day) return a.day - b.day;
        return a.time.localeCompare(b.time);
      });
    const perDay: Record<number, number> = {};
    return sorted.map<ActivityWithIndex>((a) => {
      perDay[a.day] = (perDay[a.day] || 0) + 1;
      return { ...a, indexInDay: perDay[a.day] };
    });
  }, [activities]);

  const visibleDays = useMemo(() => {
    const set = new Set<number>();
    for (const a of allWithCoords) set.add(a.day);
    return [...set].sort((a, b) => a - b);
  }, [allWithCoords]);

  const withCoords = useMemo(
    () => allWithCoords.filter((a) => !hiddenDays.has(a.day)),
    [allWithCoords, hiddenDays]
  );

  const activeActivity = activeActivityId
    ? withCoords.find((a) => a.id === activeActivityId) || null
    : null;

  // Auto-open popup when active changes. We always close the popup we
  // previously opened first — otherwise hovering an activity without coords
  // (no marker) leaves the prior activity's popup, and its image, on the map.
  const lastOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastOpenedRef.current;
    if (prev && markerRefs.current[prev]) {
      markerRefs.current[prev]?.closePopup();
    }
    lastOpenedRef.current = null;

    if (activeActivityId && markerRefs.current[activeActivityId]) {
      markerRefs.current[activeActivityId]?.openPopup();
      lastOpenedRef.current = activeActivityId;
    }
  }, [activeActivityId]);

  // Empty state — no activity has coords at all
  if (allWithCoords.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#eeeae1] px-6">
        <div className="text-center text-[#6b6b6b] max-w-xs">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full border border-[#d4cfc5] flex items-center justify-center">
            <svg className="w-5 h-5 text-[#b8b1a6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-[11px] font-mono tracking-[0.2em] uppercase mb-2 text-[#8b8378]">
            Chưa có toạ độ
          </div>
          <div className="text-sm leading-relaxed">
            Mở từng hoạt động và chọn địa điểm từ thư viện để bản đồ tự động vẽ.
            Hoặc kéo thả từ <span className="font-medium text-[#1a1a1a]">Kho hoạt động</span> bên trái.
          </div>
        </div>
      </div>
    );
  }

  // Default center: first visible coord, or first all-coord, or Vietnam-wide
  const defaultCenter: [number, number] = withCoords[0]
    ? [withCoords[0].lat!, withCoords[0].lng!]
    : allWithCoords[0]
    ? [allWithCoords[0].lat!, allWithCoords[0].lng!]
    : [16.05, 107.85]; // Vietnam center
  const defaultZoom = withCoords.length > 0 ? 13 : 6;

  function toggleDay(d: number) {
    setHiddenDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  return (
    <div className="relative w-full h-full">
      {/* Day filter chips (only when 2+ days have coords) — bottom to avoid Leaflet zoom controls (top-left) */}
      {visibleDays.length >= 2 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-1.5 flex-wrap justify-center max-w-[calc(100%-24px)] px-2 py-1.5 rounded-full bg-white/85 border border-[#e0d9cc] shadow-sm backdrop-blur-sm">
          {visibleDays.map((d) => {
            const hidden = hiddenDays.has(d);
            const color = dayColor(d);
            return (
              <button
                key={`chip-${d}`}
                onClick={() => toggleDay(d)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium tracking-wider uppercase shadow-sm transition"
                style={{
                  background: hidden ? "rgba(255,255,255,0.85)" : color,
                  color: hidden ? "#8b8378" : "#f5f0e8",
                  border: `1px solid ${hidden ? "#d4cfc5" : color}`,
                }}
                aria-pressed={!hidden}
                title={hidden ? `Hiện Day ${d}` : `Ẩn Day ${d}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: hidden ? color : "#f5f0e8" }}
                  aria-hidden
                />
                Day {String(d).padStart(2, "0")}
              </button>
            );
          })}
        </div>
      )}

      {/* Destination label (top-right, subtle) */}
      {destination && (
        <div className="absolute top-3 right-3 z-[400] px-2.5 py-1 rounded-full bg-white/85 border border-[#e0d9cc] text-[10px] font-mono tracking-[0.2em] uppercase text-[#6b6b6b] shadow-sm">
          {destination}
        </div>
      )}

      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
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
                <div className="min-w-[220px] max-w-[260px]">
                  {a.coverImage && (
                    <div
                      className="w-full h-24 mb-2 rounded-md bg-[#eeeae1] bg-cover bg-center"
                      style={{ backgroundImage: `url(${a.coverImage})` }}
                      role="img"
                      aria-label={a.title}
                    />
                  )}
                  <div
                    className="text-[10px] font-mono tracking-[0.2em] uppercase mb-1"
                    style={{ color: dayColor(a.day) }}
                  >
                    Day {String(a.day).padStart(2, "0")} · #{a.indexInDay} · {a.time}
                  </div>
                  <div className="text-sm font-semibold text-[#1a1a1a] leading-snug">
                    {a.title}
                  </div>
                  {a.location && (
                    <div className="text-xs text-[#6b6b6b] mt-1 line-clamp-2">{a.location}</div>
                  )}
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
    </div>
  );
}
