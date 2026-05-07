"use client";

import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues (Leaflet requires browser APIs)
const PlacesMapDynamic = dynamic(() => import("./places-map"), { ssr: false });

export default PlacesMapDynamic;
