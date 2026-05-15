"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, MapPin, TrendingUp } from "lucide-react";
import Link from "next/link";
import { ItineraryCard } from "./itinerary-card";
import { apiFetch } from "@/lib/api";
import type { Itinerary, PaginatedList } from "@/lib/types";

const fallbackTrips = [
  {
    title: "Hạ Long chậm rãi",
    destination: "Quảng Ninh",
    duration: "3 ngày",
    image: "https://images.unsplash.com/photo-1528127269322-539801943592?w=800&q=80",
    prompt: "Tạo lịch trình Hạ Long 3 ngày thư giãn, có du thuyền và hải sản địa phương",
  },
  {
    title: "Hội An cuối tuần",
    destination: "Quảng Nam",
    duration: "2 ngày",
    image: "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&q=80",
    prompt: "Tạo lịch trình Hội An 2 ngày cho cặp đôi, ưu tiên phố cổ và quán ăn địa phương",
  },
  {
    title: "Sapa mùa núi",
    destination: "Lào Cai",
    duration: "4 ngày",
    image: "https://images.unsplash.com/photo-1570366583862-f91883984fde?w=800&q=80",
    prompt: "Tạo lịch trình Sapa 4 ngày, đi bản làng, săn mây và di chuyển hợp lý",
  },
];

export function TrendingSection() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const hasLiveItineraries = itineraries.length > 0;

  useEffect(() => {
    apiFetch<PaginatedList<Itinerary>>("/itineraries", {
      query: { status: "PUBLISHED", limit: 6, page: 1 },
      auth: false,
    })
      .then(({ data }) => setItineraries(data || []))
      .catch(() => {});
  }, []);

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
              {hasLiveItineraries
                ? "Những hành trình được cộng đồng đánh giá cao và chia sẻ nhiều nhất trong tuần qua."
                : "Một vài gợi ý để bạn bắt đầu nhanh khi chưa có lịch trình cộng đồng mới."}
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
          {hasLiveItineraries
            ? itineraries.map((itinerary, index) => (
              <ItineraryCard
                key={itinerary.id}
                itinerary={itinerary}
                index={index}
              />
            ))
            : fallbackTrips.map((trip, index) => (
              <motion.div
                key={trip.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                viewport={{ once: true }}
              >
                <Link
                  href={`/ai-planner?q=${encodeURIComponent(trip.prompt)}`}
                  className="group block h-full overflow-hidden rounded-2xl border border-[#e8e2d9] bg-white transition-all duration-300 hover:-translate-y-1 hover:border-[#c4785a]/30 hover:shadow-xl"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url('${trip.image}')` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/70 via-[#1a1a1a]/10 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="text-xl font-semibold leading-tight tracking-tight text-white">
                        {trip.title}
                      </h3>
                      <div className="mt-2 flex items-center gap-3 text-sm text-white/80">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {trip.destination}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {trip.duration}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-5">
                    <span className="text-sm font-medium text-[#1a1a1a]">
                      Tạo lịch trình tương tự
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#c4785a] transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              </motion.div>
            ))}
        </div>
      </div>
    </section>
  );
}
