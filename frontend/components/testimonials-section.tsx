"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Quote, ChevronLeft, ChevronRight, Star, MapPin } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { useRef, useState } from "react";

import "swiper/css";
import "swiper/css/pagination";

const allTestimonials = [
  {
    name: "Minh Anh",
    role: "Travel Blogger",
    location: "Hà Nội",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100",
    content:
      "TripCompass giúp tôi lên kế hoạch cho chuyến đi Hạ Long chỉ trong 10 phút. AI gợi ý rất chính xác và phù hợp với budget của tôi!",
    rating: 5,
    tripImage: "https://images.unsplash.com/photo-1528127269322-539801943592?w=400",
    tripName: "Vịnh Hạ Long 3N2Đ",
  },
  {
    name: "Hoàng Nam",
    role: "Photographer",
    location: "Đà Nẵng",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
    content:
      "Tính năng drag-and-drop trong planner cực kỳ tiện lợi. Tôi có thể dễ dàng sắp xếp lại lịch trình theo ý muốn.",
    rating: 5,
    tripImage: "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400",
    tripName: "Đà Nẵng - Hội An 4N3Đ",
  },
  {
    name: "Thu Hương",
    role: "Food Enthusiast",
    location: "TP. Hồ Chí Minh",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100",
    content:
      "Những gợi ý về ẩm thực địa phương từ TripCompass giúp tôi khám phá nhiều món ngon mà không cần tìm kiếm nhiều.",
    rating: 5,
    tripImage: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=400",
    tripName: "Ẩm thực Sài Gòn 2N1Đ",
  },
  {
    name: "Đức Trung",
    role: "Adventure Seeker",
    location: "Hà Nội",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100",
    content:
      "Tôi đã sử dụng TripCompass cho chuyến phượt Tây Bắc. Lịch trình được tối ưu hóa giúp tôi tiết kiệm cả thời gian và chi phí.",
    rating: 5,
    tripImage: "https://images.unsplash.com/photo-1570366583862-f91883984fde?w=400",
    tripName: "Tây Bắc mùa lúa 5N4Đ",
  },
  {
    name: "Thanh Mai",
    role: "Solo Traveler",
    location: "Cần Thơ",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
    content:
      "Là một người hay đi du lịch một mình, TripCompass giúp tôi cảm thấy an tâm hơn với những gợi ý về nơi ở an toàn.",
    rating: 4,
    tripImage: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?w=400",
    tripName: "Phú Quốc solo trip 4N3Đ",
  },
  {
    name: "Quang Huy",
    role: "Family Traveler",
    location: "Hải Phòng",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
    content:
      "Với 2 con nhỏ, việc lên kế hoạch du lịch luôn là thách thức. TripCompass gợi ý những hoạt động phù hợp cho cả gia đình!",
    rating: 5,
    tripImage: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400",
    tripName: "Nha Trang gia đình 5N4Đ",
  },
  {
    name: "Lan Phương",
    role: "Budget Traveler",
    location: "Huế",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100",
    content:
      "Tính năng ước tính chi phí của TripCompass giúp tôi kiểm soát ngân sách du lịch rất hiệu quả. Không còn lo bị vượt chi nữa!",
    rating: 5,
    tripImage: "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=400",
    tripName: "Huế - Đà Nẵng tiết kiệm 3N2Đ",
  },
  {
    name: "Minh Tuấn",
    role: "Backpacker",
    location: "Đà Lạt",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100",
    content:
      "Cộng đồng TripCompass rất năng động. Tôi học được nhiều tips hay từ những lịch trình được chia sẻ bởi các traveler khác.",
    rating: 5,
    tripImage: "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=400",
    tripName: "Trekking Đà Lạt 3N2Đ",
  },
];

export function TestimonialsSection() {
  const swiperRef = useRef<SwiperType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="relative py-24 lg:py-32 bg-[#f5f0e8] overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#c4785a]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#3d5a3d]/5 rounded-full blur-3xl" />
      </div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-16"
        >
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#c4785a]/10 rounded-full mb-6">
              <Quote className="w-4 h-4 text-[#c4785a]" />
              <span className="text-sm text-[#c4785a] font-medium">
                Đánh giá từ cộng đồng
              </span>
            </div>
            <h2 className="font-serif text-4xl lg:text-5xl font-bold text-[#1a1a1a] leading-tight mb-4">
              Cộng đồng
              <br />
              <span className="text-[#c4785a]">nói gì về chúng tôi</span>
            </h2>
            <p className="text-[#6b6b6b]">
              Hơn 50,000 du khách đã tin tưởng và sử dụng TripCompass cho chuyến đi của họ.
            </p>
          </div>
          
          {/* Navigation Arrows */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => swiperRef.current?.slidePrev()}
              className="w-12 h-12 flex items-center justify-center rounded-full border-2 border-[#e8e2d9] text-[#6b6b6b] hover:text-[#1a1a1a] hover:border-[#c4785a] hover:bg-[#c4785a]/10 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => swiperRef.current?.slideNext()}
              className="w-12 h-12 flex items-center justify-center rounded-full border-2 border-[#e8e2d9] text-[#6b6b6b] hover:text-[#1a1a1a] hover:border-[#c4785a] hover:bg-[#c4785a]/10 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>

        {/* Swiper Container */}
        <Swiper
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
          modules={[Navigation, Pagination, Autoplay]}
          spaceBetween={24}
          slidesPerView={1}
          loop={true}
          autoplay={{
            delay: 5000,
            disableOnInteraction: false,
          }}
          breakpoints={{
            640: {
              slidesPerView: 2,
            },
            1024: {
              slidesPerView: 3,
            },
          }}
        >
          {allTestimonials.map((testimonial, index) => (
            <SwiperSlide key={index}>
              <div className="group relative p-6 bg-white border border-[#e8e2d9] rounded-2xl h-full hover:border-[#c4785a]/30 hover:shadow-lg transition-all duration-300">
                {/* Trip Image Preview */}
                <div className="relative h-40 -mx-6 -mt-6 mb-5 rounded-t-2xl overflow-hidden">
                  <Image
                    src={testimonial.tripImage}
                    alt={testimonial.tripName}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/70 to-transparent" />
                  <div className="absolute bottom-3 left-4">
                    <span className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium text-[#1a1a1a]">
                      {testimonial.tripName}
                    </span>
                  </div>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < testimonial.rating
                          ? "fill-[#d4a853] text-[#d4a853]"
                          : "text-[#e8e2d9]"
                      }`}
                    />
                  ))}
                </div>

                {/* Content */}
                <p className="text-[#6b6b6b] leading-relaxed mb-6 text-sm line-clamp-4">
                  &ldquo;{testimonial.content}&rdquo;
                </p>

                {/* Author */}
                <div className="flex items-center gap-3 pt-4 border-t border-[#e8e2d9]">
                  <Image
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    width={44}
                    height={44}
                    className="rounded-full w-11 h-11 object-cover"
                  />
                  <div>
                    <p className="font-medium text-[#1a1a1a] text-sm">{testimonial.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#c4785a]">{testimonial.role}</span>
                      <span className="text-[#e8e2d9]">·</span>
                      <span className="text-xs text-[#6b6b6b] flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />
                        {testimonial.location}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Pagination Dots */}
        <div className="flex items-center justify-center gap-2 mt-10">
          {allTestimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => swiperRef.current?.slideToLoop(index)}
              className={`h-2 rounded-full transition-all ${
                activeIndex === index
                  ? "w-8 bg-[#c4785a]"
                  : "w-2 bg-[#e8e2d9] hover:bg-[#c4785a]/40"
              }`}
            />
          ))}
        </div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          viewport={{ once: true }}
          className="mt-16 p-8 bg-[#1a1a1a] rounded-2xl"
        >
          <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-16 text-center">
            <div>
              <p className="text-3xl font-bold text-[#d4a853]">4.9/5</p>
              <p className="text-sm text-white/60">Đánh giá trung bình</p>
            </div>
            <div className="w-px h-12 bg-white/10 hidden sm:block" />
            <div>
              <p className="text-3xl font-bold text-[#d4a853]">50K+</p>
              <p className="text-sm text-white/60">Du khách hài lòng</p>
            </div>
            <div className="w-px h-12 bg-white/10 hidden sm:block" />
            <div>
              <p className="text-3xl font-bold text-[#d4a853]">98%</p>
              <p className="text-sm text-white/60">Tỷ lệ giới thiệu</p>
            </div>
            <div className="w-px h-12 bg-white/10 hidden sm:block" />
            <div>
              <p className="text-3xl font-bold text-[#d4a853]">24/7</p>
              <p className="text-sm text-white/60">Hỗ trợ khách hàng</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
