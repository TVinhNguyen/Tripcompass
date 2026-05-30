"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Copy, Eye, Calendar, MapPin, ArrowUpRight, Star } from "lucide-react";
import { type Itinerary } from "@/lib/types";

interface ItineraryCardProps {
  itinerary: Itinerary;
  index?: number;
  variant?: "default" | "compact";
}

const BUDGET_LABELS: Record<string, string> = {
  BUDGET: "Tiết kiệm",
  MODERATE: "Vừa phải",
  LUXURY: "Sang trọng",
};

// Compute days from start/end date, fallback to 1
function numDays(it: Itinerary): number {
  if (!it.start_date || !it.end_date) return 1;
  const a = new Date(it.start_date);
  const b = new Date(it.end_date);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}

export function ItineraryCard({ itinerary, index = 0, variant = "default" }: ItineraryCardProps) {
  const cover = itinerary.cover_image_url || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800";
  const days  = numDays(itinerary);
  const href = itinerary.status === "PUBLISHED" ? `/itinerary/${itinerary.id}/public` : `/itinerary/${itinerary.id}`;
  const hasRating = (itinerary.rating ?? 0) > 0;

  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.08 }}
        viewport={{ once: true }}
      >
        <Link href={href} className="block h-full">
          <article className="group relative bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(26,26,26,0.04)] hover:shadow-[0_14px_36px_-12px_rgba(26,26,26,0.2)] hover:-translate-y-1 transition-all duration-300 h-full flex flex-col">
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image
                src={cover}
                alt={itinerary.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {/* Overlays below sit on the photo, so their colours are fixed
                  (white scrims / dark gradient) rather than theme tokens. */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/60 via-transparent to-transparent" />

              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-white/95 backdrop-blur-sm rounded-full text-xs font-semibold text-[#1a1a1a]">
                <Calendar className="w-3 h-3 text-[#3d5a3d]" />
                <span>{days} ngày</span>
              </div>
            </div>

            <div className="p-4 flex flex-col flex-1">
              <h3 className="text-base font-semibold text-foreground mb-1.5 group-hover:text-primary transition-colors line-clamp-2 tracking-tight leading-snug">
                {itinerary.title}
              </h3>

              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="line-clamp-1">{itinerary.destination || "Việt Nam"}</span>
              </div>

              <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Eye className="w-3 h-3 text-muted-foreground" />
                  <span>{itinerary.view_count?.toLocaleString("vi-VN") ?? 0}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Copy className="w-3.5 h-3.5 text-secondary" />
                  <span>{itinerary.clone_count?.toLocaleString("vi-VN") ?? 0}</span>
                </div>
                {hasRating && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Star className="w-3.5 h-3.5 fill-accent text-accent" />
                    <span>{itinerary.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>
          </article>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      viewport={{ once: true }}
    >
      <Link href={href} className="block h-full">
        <article className="group relative bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(26,26,26,0.04)] hover:shadow-[0_16px_44px_-12px_rgba(26,26,26,0.24)] hover:-translate-y-1 transition-all duration-300 h-full flex flex-col">
          <div className="relative aspect-[16/10] overflow-hidden">
            <Image
              src={cover}
              alt={itinerary.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-700"
            />
            {/* Photo overlays: fixed colours, not theme tokens. */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/75 via-[#1a1a1a]/10 to-transparent" />

            <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-sm rounded-full text-xs font-semibold text-[#1a1a1a] shadow-sm">
              <Calendar className="w-3.5 h-3.5 text-[#3d5a3d]" />
              <span>{days} ngày</span>
            </div>

            <div className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center bg-white/95 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300 shadow-md">
              <ArrowUpRight className="w-4 h-4 text-[#1a1a1a]" />
            </div>

            <div className="absolute bottom-4 left-4 right-4">
              <h3 className="text-xl font-semibold text-white mb-1 line-clamp-2 drop-shadow-sm tracking-tight leading-tight">
                {itinerary.title}
              </h3>
              <div className="flex items-center gap-1.5 text-sm text-white/80">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="line-clamp-1">{itinerary.destination || "Việt Nam"}</span>
              </div>
            </div>
          </div>

          <div className="p-5 flex flex-col flex-1">
            <div className="flex flex-wrap gap-1.5 mb-4">
              {itinerary.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 bg-muted rounded-full text-xs font-medium text-primary"
                >
                  {tag}
                </span>
              ))}
              {itinerary.tags.length > 3 && (
                <span className="px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  +{itinerary.tags.length - 3}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
              {/* Budget badge */}
              <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                {BUDGET_LABELS[itinerary.budget_category] ?? itinerary.budget_category}
              </span>

              <div className="flex items-center gap-3 text-muted-foreground text-sm shrink-0">
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{itinerary.view_count?.toLocaleString("vi-VN") ?? 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Copy className="w-4 h-4 text-secondary" />
                  <span className="font-medium">{itinerary.clone_count?.toLocaleString("vi-VN") ?? 0}</span>
                </div>
                {hasRating && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-accent text-accent" />
                    <span className="font-medium">{itinerary.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </article>
      </Link>
    </motion.div>
  );
}
