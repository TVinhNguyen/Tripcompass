"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { Heart, MapPin, Star, Clock } from "lucide-react"
import { motion } from "framer-motion"
import { type Place, type PlaceCategory } from "@/lib/types"
import { apiFetch } from "@/lib/api"
import { cn } from "@/lib/utils"

interface PlaceCardProps {
  place: Place
  index?: number
  variant?: "grid" | "list"
  initialSaved?: boolean
}

const CATEGORY_STYLES: Record<PlaceCategory, string> = {
  ATTRACTION: "bg-[#3d5a3d]/10 text-[#3d5a3d] border-[#3d5a3d]/20",
  FOOD:       "bg-[#c4785a]/10 text-[#c4785a] border-[#c4785a]/20",
  STAY:       "bg-[#d4a853]/10 text-[#a8842a] border-[#d4a853]/30",
}

const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  ATTRACTION: "Tham quan",
  FOOD:       "Ăn uống",
  STAY:       "Lưu trú",
}

function formatVnd(n: number | null | undefined): string {
  if (!n) return "Miễn phí"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M₫`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K₫`
  return `${n}₫`
}

export function PlaceCard({ place, index = 0, variant = "grid", initialSaved = false }: PlaceCardProps) {
  const [saved, setSaved] = useState(initialSaved)
  const [saving, setSaving] = useState(false)

  const cover = place.cover_image || "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800"
  const catStyle = CATEGORY_STYLES[place.category] || CATEGORY_STYLES.ATTRACTION
  const catLabel = CATEGORY_LABELS[place.category] || place.category
  const location  = place.area || place.destination
  const hours = place.open_time && place.close_time
    ? `${place.open_time} – ${place.close_time}`
    : place.open_time || null

  const toggleSave = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const next = !saved
    setSaved(next)
    try {
      if (next) {
        await apiFetch(`/user/saved-places`, { method: "POST", body: { place_id: place.id } })
      } else {
        await apiFetch(`/user/saved-places/${place.id}`, { method: "DELETE" })
      }
    } catch {
      setSaved(!next) // rollback
    } finally {
      setSaving(false)
    }
  }

  if (variant === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.03 }}
      >
        <Link
          href={`/places/${place.id}`}
          className="group flex flex-col sm:flex-row gap-4 p-4 bg-white border border-[#e8e2d9] rounded-2xl hover:border-[#3d5a3d]/40 hover:shadow-lg transition-all"
        >
          <div className="relative w-full sm:w-48 aspect-[4/3] sm:aspect-square rounded-xl overflow-hidden shrink-0">
            <Image
              src={cover}
              alt={place.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-700"
            />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0">
                <div className={cn("inline-flex px-2 py-0.5 rounded-full text-xs border mb-2", catStyle)}>
                  {catLabel}
                </div>
                <h3 className="text-base font-semibold text-[#1a1a1a] group-hover:text-[#3d5a3d] transition-colors truncate tracking-tight">
                  {place.name}
                </h3>
              </div>
              <button onClick={toggleSave} className="shrink-0 p-2 -m-2" aria-label="Lưu địa điểm">
                <Heart className={cn("w-5 h-5 transition-colors", saved ? "fill-[#c4785a] text-[#c4785a]" : "text-[#8b8378]")} />
              </button>
            </div>
            <p className="text-sm text-[#6b6b6b] line-clamp-2 mb-3">{place.description}</p>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="flex items-center gap-1 text-[#6b6b6b]">
                <MapPin className="w-3.5 h-3.5" />
                {location}
              </span>
              {place.rating != null && (
                <span className="flex items-center gap-1 text-[#1a1a1a]">
                  <Star className="w-3.5 h-3.5 fill-[#d4a853] text-[#d4a853]" />
                  <span className="font-medium">{place.rating.toFixed(1)}</span>
                  <span className="text-[#8b8378]">({place.review_count})</span>
                </span>
              )}
              <span className="ml-auto font-mono tabular-nums text-sm font-semibold text-[#3d5a3d]">
                {formatVnd(place.base_price)}
              </span>
            </div>
          </div>
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link
        href={`/places/${place.id}`}
        className="group flex flex-col bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden hover:border-[#3d5a3d]/40 hover:shadow-xl transition-all h-full"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={cover}
            alt={place.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute top-3 left-3">
            <div className={cn("inline-flex px-2.5 py-1 rounded-full text-xs border backdrop-blur-md bg-white/90", catStyle)}>
              {catLabel}
            </div>
          </div>
          <button
            onClick={toggleSave}
            aria-label="Lưu địa điểm"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center hover:bg-white shadow-sm"
          >
            <Heart className={cn("w-4 h-4 transition-colors", saved ? "fill-[#c4785a] text-[#c4785a]" : "text-[#1a1a1a]")} />
          </button>
          {place.rating != null && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs">
              <Star className="w-3 h-3 fill-[#d4a853] text-[#d4a853]" />
              <span className="font-medium">{place.rating.toFixed(1)}</span>
            </div>
          )}
          {place.must_visit && (
            <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-[#d4a853] text-[#1a1a1a] text-xs font-semibold">
              Phải thăm
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col p-4">
          <h3 className="text-base font-semibold text-[#1a1a1a] group-hover:text-[#3d5a3d] transition-colors mb-1 line-clamp-1 tracking-tight">
            {place.name}
          </h3>
          <div className="flex items-center gap-1 text-xs text-[#6b6b6b] mb-3">
            <MapPin className="w-3 h-3" />
            <span>{location}</span>
            {hours && (
              <>
                <span>•</span>
                <Clock className="w-3 h-3" />
                <span className="truncate">{hours}</span>
              </>
            )}
          </div>
          <p className="text-sm text-[#6b6b6b] line-clamp-2 mb-4 flex-1">{place.description}</p>
          <div className="flex items-center justify-between pt-3 border-t border-[#e8e2d9]">
            <span className="font-mono tabular-nums text-sm font-semibold text-[#3d5a3d]">
              {formatVnd(place.base_price)}
            </span>
            {place.review_count != null && (
              <span className="text-xs text-[#8b8378]">{place.review_count} đánh giá</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
