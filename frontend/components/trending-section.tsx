"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ItineraryCard } from "./itinerary-card";
import { trendingItineraries } from "@/lib/mock-data";

export function TrendingSection() {
  // Featured itinerary (first one)
  const featured = trendingItineraries[0];
  // Rest of itineraries
  const others = trendingItineraries.slice(1, 5);

  return (
    <section className="relative py-24 lg:py-32 bg-[#f5f0e8] overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute top-20 right-10 w-72 h-72 bg-[#3d5a3d]/5 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#c4785a]/5 rounded-full blur-3xl" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12"
        >
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#3d5a3d]/10 rounded-full mb-6">
              <TrendingUp className="w-4 h-4 text-[#3d5a3d]" />
              <span className="text-sm text-[#3d5a3d] font-medium">
                Xu hướng tuần này
              </span>
            </div>
            <h2 className="font-serif text-4xl lg:text-5xl font-bold text-[#1a1a1a] mb-4 leading-tight">
              Lịch trình
              <span className="text-[#c4785a]"> được yêu thích</span>
            </h2>
            <p className="text-[#6b6b6b] text-lg">
              Những hành trình được cộng đồng đánh giá cao và chia sẻ nhiều nhất trong tuần qua
            </p>
          </div>

          <Link
            href="/explore"
            className="inline-flex items-center gap-2 px-6 py-3 border-2 border-[#1a1a1a] text-[#1a1a1a] font-medium rounded-full hover:bg-[#1a1a1a] hover:text-white transition-all group"
          >
            <span>Xem tất cả</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>

        {/* Featured + Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Featured Large Card */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <Link href={`/itinerary/${featured.id}`}>
              <div className="group relative h-full min-h-[500px] bg-white border border-[#e8e2d9] rounded-3xl overflow-hidden hover:shadow-2xl hover:shadow-[#1a1a1a]/10 transition-all duration-500">
                {/* Cover Image */}
                <div className="absolute inset-0">
                  <Image
                    src={featured.coverImage}
                    alt={featured.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/40 to-transparent" />
                </div>

                {/* Featured Badge */}
                <div className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-[#d4a853] rounded-full">
                  <Sparkles className="w-4 h-4 text-white" />
                  <span className="text-sm font-semibold text-white">Nổi bật</span>
                </div>

                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {featured.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-sm text-white font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Title */}
                  <h3 className="font-serif text-3xl lg:text-4xl font-bold text-white mb-2 group-hover:text-[#d4a853] transition-colors">
                    {featured.title}
                  </h3>
                  <p className="text-white/70 text-lg mb-6">{featured.titleEn}</p>

                  {/* Author & Stats */}
                  <div className="flex items-center justify-between pt-6 border-t border-white/20">
                    <div className="flex items-center gap-3">
                      <Image
                        src={featured.author.avatar}
                        alt={featured.author.name}
                        width={44}
                        height={44}
                        className="rounded-full w-11 h-11 object-cover border-2 border-white/30"
                      />
                      <div>
                        <p className="font-medium text-white">{featured.author.name}</p>
                        <p className="text-sm text-white/60">{featured.duration} ngày</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 text-white/80">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-white">{(featured.likes / 1000).toFixed(1)}k</p>
                        <p className="text-xs text-white/60">Yêu thích</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-white">{(featured.views / 1000).toFixed(1)}k</p>
                        <p className="text-xs text-white/60">Lượt xem</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Grid of 4 Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {others.map((itinerary, index) => (
              <ItineraryCard
                key={itinerary.id}
                itinerary={itinerary}
                index={index}
                variant="compact"
              />
            ))}
          </div>
        </div>

        {/* Bottom Row - 2 more cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {trendingItineraries.slice(5, 8).map((itinerary, index) => (
            <ItineraryCard
              key={itinerary.id}
              itinerary={itinerary}
              index={index + 5}
            />
          ))}
        </div>

        {/* Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="mt-16 p-8 bg-[#1a1a1a] rounded-2xl"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-[#d4a853] mb-2">500+</p>
              <p className="text-white/60">Lịch trình</p>
            </div>
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-[#d4a853] mb-2">50k+</p>
              <p className="text-white/60">Du khách</p>
            </div>
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-[#d4a853] mb-2">63</p>
              <p className="text-white/60">Tỉnh thành</p>
            </div>
            <div>
              <p className="text-3xl lg:text-4xl font-bold text-[#d4a853] mb-2">4.9</p>
              <p className="text-white/60">Đánh giá TB</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
