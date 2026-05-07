"use client";

// =============================================================================
// TripCompass — PlacesMap component
// Source of truth: docs/frontend-review-2026-05-01.md §FE-10
//
// Adapted from itinerary-map.tsx — renders markers from Place[] instead of Activity[].
// =============================================================================

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Place } from "@/lib/types";
import { formatVND } from "@/lib/format";

// Fix default icon paths (Leaflet webpack/Next issue)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  ATTRACTION: "#3d5a3d",
  FOOD:       "#c4785a",
  STAY:       "#d4a853",
};

function categoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? "#8b8378";
}

function createPlaceIcon(category: string) {
  const color = categoryColor(category);
  return L.divIcon({
    className: "place-marker",
    html: `
      <div style="
        width:32px;height:32px;
        transform:translate(-50%,-100%);
        position:relative;
      ">
        <div style="
          width:100%;height:100%;
          background:${color};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          box-shadow:0 4px 12px rgba(0,0,0,0.25);
          border:2px solid #f5f0e8;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function FitBounds({ places }: { places: Place[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = places.filter((p) => p.latitude != null && p.longitude != null);
    if (valid.length === 0) return;
    if (valid.length === 1) { map.setView([valid[0].latitude!, valid[0].longitude!], 14); return; }
    const bounds = L.latLngBounds(valid.map((p) => [p.latitude!, p.longitude!] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
  }, [places, map]);
  return null;
}

interface PlacesMapProps {
  places: Place[];
  onMarkerClick?: (placeId: string) => void;
}

export default function PlacesMap({ places, onMarkerClick }: PlacesMapProps) {
  const withCoords = useMemo(
    () => places.filter((p) => p.latitude != null && p.longitude != null),
    [places],
  );

  // Default center: Ho Chi Minh City
  const defaultCenter: [number, number] =
    withCoords.length > 0
      ? [withCoords[0].latitude!, withCoords[0].longitude!]
      : [10.8231, 106.6297];

  if (withCoords.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#eeeae1]">
        <div className="text-center text-[#6b6b6b] px-6">
          <div className="text-[11px] font-mono tracking-[0.2em] uppercase mb-2">No locations</div>
          <div className="text-sm">Các địa điểm này chưa có tọa độ</div>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={defaultCenter}
      zoom={11}
      scrollWheelZoom
      className="w-full h-full z-0"
      style={{ background: "#eeeae1" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitBounds places={withCoords} />

      {withCoords.map((place) => (
        <Marker
          key={place.id}
          position={[place.latitude!, place.longitude!]}
          icon={createPlaceIcon(place.category)}
          eventHandlers={{ click: () => onMarkerClick?.(place.id) }}
        >
          <Popup closeButton={false} className="itinerary-popup">
            <div className="min-w-[180px]">
              <div
                className="text-[10px] font-mono tracking-[0.2em] uppercase mb-1"
                style={{ color: categoryColor(place.category) }}
              >
                {place.category}
              </div>
              <div className="text-sm font-semibold text-[#1a1a1a] leading-snug">
                {place.name}
              </div>
              {place.area && (
                <div className="text-xs text-[#6b6b6b] mt-1">{place.area}</div>
              )}
              {place.base_price != null && place.base_price > 0 && (
                <div className="text-xs font-mono tabular-nums text-[#1a1a1a] mt-2">
                  {formatVND(place.base_price)}
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
