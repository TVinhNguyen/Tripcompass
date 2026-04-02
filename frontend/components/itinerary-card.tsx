"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Heart, Eye, Calendar, MapPin, ArrowUpRight } from "lucide-react";
import { type Itinerary } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface ItineraryCardProps {
  itinerary: Itinerary;
  index?: number;
  variant?: "default" | "compact";
}

export function ItineraryCard({ itinerary, index = 0, variant = "default" }: ItineraryCardProps) {
  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.1 }}
        viewport={{ once: true }}
      >
        <Link href={`/itinerary/${itinerary.id}`}>
          <div className="group relative bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-[#1a1a1a]/5 hover:border-[#c4785a]/30 transition-all duration-300 h-full">
            {/* Cover Image */}
            <div className="relative h-36 overflow-hidden">
              <Image
                src={itinerary.coverImage}
                alt={itinerary.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Duration Badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 bg-white/95 rounded-full text-xs font-medium text-[#1a1a1a]">
                <Calendar className="w-3 h-3 text-[#3d5a3d]" />
                <span>{itinerary.duration} ngày</span>
              </div>

              {/* Hover Arrow */}
              <div className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-white/0 rounded-full opacity-0 group-hover:opacity-100 group-hover:bg-white transition-all">
                <ArrowUpRight className="w-4 h-4 text-[#1a1a1a]" />
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              <h3 className="font-serif text-base font-bold text-[#1a1a1a] mb-1 group-hover:text-[#c4785a] transition-colors line-clamp-1">
                {itinerary.title}
              </h3>
              
              <div className="flex items-center gap-1 text-xs text-[#6b6b6b] mb-3">
                <MapPin className="w-3 h-3" />
                <span className="line-clamp-1">{itinerary.destinations?.join(", ") || "Việt Nam"}</span>
              </div>

              {/* Stats */}
              <div className="flex items-center justify-between pt-3 border-t border-[#e8e2d9]">
                <div className="flex items-center gap-2">
                  <Image
                    src={itinerary.author.avatar}
                    alt={itinerary.author.name}
                    width={24}
                    height={24}
                    className="rounded-full w-6 h-6 object-cover"
                  />
                  <span className="text-xs text-[#6b6b6b] truncate max-w-[80px]">
                    {itinerary.author.name}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[#8b8378] text-xs">
                  <div className="flex items-center gap-0.5">
                    <Heart className="w-3.5 h-3.5 text-[#c4785a]" />
                    <span>{(itinerary.likes / 1000).toFixed(1)}k</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      viewport={{ once: true }}
    >
      <Link href={`/itinerary/${itinerary.id}`}>
        <div className="group relative bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-[#1a1a1a]/8 hover:border-[#c4785a]/30 transition-all duration-500">
          {/* Cover Image */}
          <div className="relative h-56 overflow-hidden">
            <Image
              src={itinerary.coverImage}
              alt={itinerary.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/80 via-[#1a1a1a]/20 to-transparent" />

            {/* Duration Badge */}
            <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-sm rounded-full text-xs font-semibold text-[#1a1a1a] shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-[#3d5a3d]" />
              <span>{itinerary.duration} ngày</span>
            </div>

            {/* Arrow Icon on Hover */}
            <div className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/0 rounded-full opacity-0 group-hover:opacity-100 group-hover:bg-white transition-all duration-300 shadow-lg">
              <ArrowUpRight className="w-5 h-5 text-[#1a1a1a]" />
            </div>

            {/* Title Overlay */}
            <div className="absolute bottom-4 left-4 right-4">
              <h3 className="font-serif text-xl font-bold text-white mb-1 group-hover:text-[#d4a853] transition-colors line-clamp-2">
                {itinerary.title}
              </h3>
              <p className="text-sm text-white/70 line-clamp-1">{itinerary.titleEn}</p>
            </div>
          </div>

          {/* Content */}
          <div className="p-5">
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {itinerary.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-[#f5f0e8] rounded-full text-xs font-medium text-[#3d5a3d] border border-[#3d5a3d]/10"
                >
                  {tag}
                </span>
              ))}
              {itinerary.tags.length > 3 && (
                <span className="px-3 py-1 bg-[#e8e2d9] rounded-full text-xs font-medium text-[#6b6b6b]">
                  +{itinerary.tags.length - 3}
                </span>
              )}
            </div>

            {/* Author & Stats */}
            <div className="flex items-center justify-between pt-4 border-t border-[#e8e2d9]">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Image
                    src={itinerary.author.avatar}
                    alt={itinerary.author.name}
                    width={32}
                    height={32}
                    className="rounded-full w-8 h-8 object-cover ring-2 ring-[#f5f0e8]"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                </div>
                <span className="text-sm font-medium text-[#1a1a1a]">
                  {itinerary.author.name}
                </span>
              </div>

              <div className="flex items-center gap-4 text-[#6b6b6b] text-sm">
                <div className="flex items-center gap-1.5 group/stat">
                  <Heart className="w-4 h-4 text-[#c4785a] group-hover/stat:scale-110 transition-transform" />
                  <span className="font-medium">{(itinerary.likes / 1000).toFixed(1)}k</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  <span>{(itinerary.views / 1000).toFixed(1)}k</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hover Border Accent */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#3d5a3d] via-[#c4785a] to-[#d4a853] transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
        </div>
      </Link>
    </motion.div>
  );
}
