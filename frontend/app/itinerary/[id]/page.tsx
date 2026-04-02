"use client";

import { useState } from "react";
import { use } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { sampleItinerary } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  MapPin,
  Clock,
  Heart,
  Share2,
  Edit3,
  DollarSign,
  Utensils,
  Camera,
  Bus,
  Hotel,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, React.ReactNode> = {
  food: <Utensils className="w-4 h-4" />,
  attraction: <Camera className="w-4 h-4" />,
  transport: <Bus className="w-4 h-4" />,
  accommodation: <Hotel className="w-4 h-4" />,
  activity: <Sparkles className="w-4 h-4" />,
};

const typeBgColors: Record<string, string> = {
  food: "bg-[#c4785a]",
  attraction: "bg-[#3d5a3d]",
  transport: "bg-[#d4a853]",
  accommodation: "bg-[#8b6f5c]",
  activity: "bg-[#5a7d7c]",
};

export default function ItineraryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [selectedDay, setSelectedDay] = useState(1);
  const [liked, setLiked] = useState(false);

  const itinerary = sampleItinerary;
  const days = [...new Set(itinerary.activities.map((a) => a.day))].sort();
  const dayActivities = itinerary.activities.filter(
    (a) => a.day === selectedDay
  );
  const dayCost = dayActivities.reduce((sum, a) => sum + (a.cost || 0), 0);

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />

      {/* Hero Section */}
      <section className="relative pt-16 lg:pt-20">
        {/* Background with Image */}
        <div className="relative h-[50vh] sm:h-[60vh] min-h-[450px]">
          <Image
            src={itinerary.coverImage}
            alt={itinerary.title}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a]/60 to-transparent" />
        </div>

        {/* Content Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-12">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {itinerary.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-[#d4a853]/20 backdrop-blur-sm rounded-full text-sm text-[#d4a853] border border-[#d4a853]/30"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Title */}
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-6xl font-bold text-white mb-2 leading-tight">
                {itinerary.title}
              </h1>
              <p className="text-white/50 text-sm sm:text-lg mb-6 italic">{itinerary.titleEn}</p>

              {/* Meta Info */}
              <div className="flex flex-wrap items-center gap-4 lg:gap-8 mb-6">
                <div className="flex items-center gap-2 text-white/80">
                  <div className="w-8 h-8 rounded-full bg-[#d4a853]/20 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-[#d4a853]" />
                  </div>
                  <span className="text-sm sm:text-base">{itinerary.duration} ngày</span>
                </div>
                <div className="flex items-center gap-2 text-white/80">
                  <div className="w-8 h-8 rounded-full bg-[#3d5a3d]/40 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-[#a8d4a8]" />
                  </div>
                  <span className="text-sm sm:text-base capitalize">
                    {itinerary.budget === "budget"
                      ? "Tiết kiệm"
                      : itinerary.budget === "moderate"
                        ? "Vừa phải"
                        : "Sang trọng"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-white/80">
                  <div className="w-8 h-8 rounded-full bg-[#c4785a]/20 flex items-center justify-center">
                    <Heart className="w-4 h-4 text-[#c4785a]" />
                  </div>
                  <span className="text-sm sm:text-base">{itinerary.likes.toLocaleString()} yêu thích</span>
                </div>
              </div>

              {/* Author & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Image
                    src={itinerary.author.avatar}
                    alt={itinerary.author.name}
                    width={48}
                    height={48}
                    className="rounded-full border-2 border-[#d4a853]/30 w-12 h-12 object-cover"
                  />
                  <div>
                    <p className="text-white font-medium">
                      {itinerary.author.name}
                    </p>
                    <p className="text-white/50 text-sm">Tác giả</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10 bg-white/5"
                    onClick={() => setLiked(!liked)}
                  >
                    <Heart
                      className={cn(
                        "w-5 h-5 mr-2",
                        liked && "fill-[#c4785a] text-[#c4785a]"
                      )}
                    />
                    {liked ? "Đã thích" : "Yêu thích"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10 bg-white/5"
                  >
                    <Share2 className="w-5 h-5 mr-2" />
                    Chia sẻ
                  </Button>
                  <Button
                    asChild
                    className="bg-[#3d5a3d] hover:bg-[#2d4a2d] text-white border-0"
                  >
                    <Link href={`/itinerary/${id}/edit`}>
                      <Edit3 className="w-5 h-5 mr-2" />
                      Chỉnh sửa
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="py-12 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Day Selector Tabs */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="w-full lg:w-56 shrink-0"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-px bg-[#d4a853]" />
                <span className="text-sm text-[#d4a853] tracking-[0.15em] uppercase font-medium">
                  Lịch trình
                </span>
              </div>
              <h2 className="font-serif text-2xl font-bold text-[#1a1a1a] mb-6">
                Chọn ngày
              </h2>
              <div className="flex overflow-x-auto pb-2 lg:pb-0 lg:flex-col gap-3 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
                {days.map((day) => (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      "flex items-center gap-4 px-4 py-4 rounded-2xl border-2 transition-all text-left shrink-0",
                      selectedDay === day
                        ? "bg-[#3d5a3d] border-[#3d5a3d] text-white shadow-lg"
                        : "bg-white border-[#e8e2d9] text-[#1a1a1a] hover:border-[#3d5a3d]/50"
                    )}
                  >
                    <div
                      className={cn(
                        "w-12 h-12 flex items-center justify-center rounded-xl text-lg font-bold shrink-0",
                        selectedDay === day
                          ? "bg-white/20 text-white"
                          : "bg-[#f5f0e8] text-[#3d5a3d]"
                      )}
                    >
                      {day}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm sm:text-base">Ngày {day}</p>
                      <p className={cn(
                        "text-xs sm:text-sm whitespace-nowrap",
                        selectedDay === day ? "text-white/70" : "text-[#6b6b6b]"
                      )}>
                        {itinerary.activities.filter((a) => a.day === day).length} hoạt động
                      </p>
                    </div>
                    <ArrowRight className={cn(
                      "w-5 h-5 ml-auto hidden lg:block",
                      selectedDay === day ? "text-white/70" : "text-[#c4785a]"
                    )} />
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Timeline */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="font-serif text-2xl lg:text-3xl font-bold text-[#1a1a1a]">
                    Ngày {selectedDay}
                  </h2>
                  <p className="text-[#6b6b6b] mt-1">{dayActivities.length} hoạt động</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-[#3d5a3d]/10 rounded-full">
                  <DollarSign className="w-5 h-5 text-[#3d5a3d]" />
                  <span className="font-semibold text-[#3d5a3d]">
                    {dayCost.toLocaleString("vi-VN")} VNĐ
                  </span>
                </div>
              </div>

              <div className="relative">
                <div className="space-y-6">
                  {dayActivities.map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className="relative pl-20 sm:pl-24"
                    >
                      {/* Timeline Line */}
                      {index < dayActivities.length - 1 && (
                        <div className="absolute left-[30px] sm:left-[34px] top-16 bottom-0 w-0.5 bg-gradient-to-b from-[#e8e2d9] to-transparent -mb-6" />
                      )}
                      
                      {/* Time Dot */}
                      <div className="absolute left-0 top-0 flex flex-col items-center">
                        <div className={cn(
                          "w-16 sm:w-[72px] h-16 sm:h-[72px] flex items-center justify-center rounded-2xl shadow-lg",
                          typeBgColors[activity.type]
                        )}>
                          <div className="text-white">
                            {typeIcons[activity.type]}
                          </div>
                        </div>
                      </div>

                      {/* Activity Card */}
                      <div className="p-5 sm:p-6 bg-white border border-[#e8e2d9] rounded-2xl shadow-sm hover:shadow-md hover:border-[#3d5a3d]/30 transition-all">
                        {/* Time */}
                        <div className="flex items-center gap-3 text-sm text-[#6b6b6b] mb-3">
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#f5f0e8] rounded-full">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="font-medium">{activity.time}</span>
                          </div>
                          <span className="text-[#c4785a]">{activity.duration} phút</span>
                        </div>

                        {/* Title */}
                        <h3 className="text-lg sm:text-xl font-bold text-[#1a1a1a] mb-1">
                          {activity.title}
                        </h3>
                        <p className="text-sm text-[#c4785a] mb-3 italic">
                          {activity.titleEn}
                        </p>

                        {/* Description */}
                        <p className="text-[#6b6b6b] mb-4 leading-relaxed">
                          {activity.description}
                        </p>

                        {/* Location & Cost */}
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          <div className="flex items-center gap-2 text-[#6b6b6b]">
                            <MapPin className="w-4 h-4 text-[#3d5a3d]" />
                            <span>{activity.location}</span>
                          </div>
                          {activity.cost && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-[#d4a853]/10 rounded-full">
                              <DollarSign className="w-4 h-4 text-[#d4a853]" />
                              <span className="font-medium text-[#d4a853]">
                                {activity.cost.toLocaleString("vi-VN")} VNĐ
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
