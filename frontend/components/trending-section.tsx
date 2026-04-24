"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import { ItineraryCard } from "./itinerary-card";
import { apiFetch } from "@/lib/api";
import type { Itinerary, PaginatedList } from "@/lib/types";

export function TrendingSection() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);

  useEffect(() => {
    apiFetch<PaginatedList<Itinerary>>("/itineraries", {
      query: { status: "PUBLISHED", limit: 6, page: 1 },
      auth: false,
    })
      .then(({ data }) => setItineraries(data || []))
      .catch(() => {}); // silent fallback — no itineraries shown
  }, []);

  if (itineraries.length === 0) return null;

  return (
    <section className="relative py-20 lg:py-28 bg-[#f5f0e8] overflow-hidden">
      {/* Subtle decorative element */}
      <div className="absolute top-40 -right-32 w-[32rem] h-[32rem] bg-[#3d5a3d]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-40 -left-32 w-[28rem] h-[28rem] bg-[#c4785a]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14"
        >
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#3d5a3d]/10 rounded-full mb-5">
              <TrendingUp className="w-3.5 h-3.5 text-[#3d5a3d]" />
              <span className="text-xs text-[#3d5a3d] font-semibold tracking-wide uppercase">
                Xu hướng tuần này
              </span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#1a1a1a] mb-4 leading-tight tracking-tight">
              Lịch trình
              <span className="text-[#c4785a]"> được yêu thích</span>
            </h2>
            <p className="text-[#6b6b6b] text-base lg:text-lg leading-relaxed">
              Những hành trình được cộng đồng đánh giá cao và chia sẻ nhiều nhất trong tuần qua.
            </p>
          </div>

          <Link
            href="/explore"
            className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#1a1a1a] border-2 border-[#1a1a1a] rounded-full hover:bg-[#1a1a1a] hover:text-white transition-colors shrink-0"
          >
            <span>Xem tất cả</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </motion.div>

        {/* Clean 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {itineraries.map((itinerary, index) => (
            <ItineraryCard
              key={itinerary.id}
              itinerary={itinerary}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
