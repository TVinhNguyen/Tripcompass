"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Quote, ChevronLeft, ChevronRight, Star } from "lucide-react";
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
    tripName: "Vịnh Hạ Long 3N2Đ",
  },
  {
    name: "Hoàng Nam",
    role: "Nhiếp ảnh gia",
    location: "Đà Nẵng",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
    content:
      "Tính năng kéo thả trong planner cực kỳ tiện lợi. Tôi có thể dễ dàng sắp xếp lại lịch trình theo ý muốn.",
    rating: 5,
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
    tripName: "Ẩm thực Sài Gòn 2N1Đ",
  },
  {
    name: "Đức Trung",
    role: "Phượt thủ",
    location: "Hà Nội",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100",
    content:
      "Tôi đã sử dụng TripCompass cho chuyến phượt Tây Bắc. Lịch trình được tối ưu giúp tôi tiết kiệm cả thời gian và chi phí.",
    rating: 5,
    tripName: "Tây Bắc mùa lúa 5N4Đ",
  },
  {
    name: "Thanh Mai",
    role: "Solo Traveler",
    location: "Cần Thơ",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
    content:
      "Là một người hay đi du lịch một mình, TripCompass giúp tôi cảm thấy an tâm hơn với những gợi ý về nơi ở an toàn.",
    rating: 5,
    tripName: "Phú Quốc solo 4N3Đ",
  },
  {
    name: "Quang Huy",
    role: "Family Traveler",
    location: "Hải Phòng",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100",
    content:
      "Với 2 con nhỏ, việc lên kế hoạch du lịch luôn là thách thức. TripCompass gợi ý những hoạt động phù hợp cho cả gia đình!",
    rating: 5,
    tripName: "Nha Trang gia đình 5N4Đ",
  },
  {
    name: "Lan Phương",
    role: "Budget Traveler",
    location: "Huế",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100",
    content:
      "Tính năng ước tính chi phí giúp tôi kiểm soát ngân sách du lịch rất hiệu quả. Không còn lo bị vượt chi nữa!",
    rating: 5,
    tripName: "Huế tiết kiệm 3N2Đ",
  },
  {
    name: "Minh Tuấn",
    role: "Backpacker",
    location: "Đà Lạt",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100",
    content:
      "Cộng đồng TripCompass rất năng động. Tôi học được nhiều mẹo hay từ những lịch trình được chia sẻ bởi các traveler khác.",
    rating: 5,
    tripName: "Trekking Đà Lạt 3N2Đ",
  },
];

export function TestimonialsSection() {
  const swiperRef = useRef<SwiperType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <section className="relative py-20 lg:py-28 bg-[#f5f0e8] overflow-hidden">
      <div className="absolute top-20 right-0 w-96 h-96 bg-[#c4785a]/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-20 left-0 w-80 h-80 bg-[#3d5a3d]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14"
        >
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#c4785a]/10 rounded-full mb-5">
              <Quote className="w-3.5 h-3.5 text-[#c4785a]" />
              <span className="text-xs text-[#c4785a] font-semibold tracking-wide uppercase">
                Cảm nhận từ cộng đồng
              </span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#1a1a1a] leading-tight tracking-tight mb-4">
              Cộng đồng nói gì
              <br />
              <span className="text-[#c4785a]">về chúng tôi</span>
            </h2>
            <p className="text-[#6b6b6b] leading-relaxed">
              Hơn 50,000 du khách đã tin tưởng và sử dụng TripCompass cho chuyến đi của họ.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => swiperRef.current?.slidePrev()}
              className="w-11 h-11 flex items-center justify-center rounded-full border border-[#e8e2d9] text-[#6b6b6b] hover:text-white hover:bg-[#1a1a1a] hover:border-[#1a1a1a] transition-all"
              aria-label="Previous"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => swiperRef.current?.slideNext()}
              className="w-11 h-11 flex items-center justify-center rounded-full border border-[#e8e2d9] text-[#6b6b6b] hover:text-white hover:bg-[#1a1a1a] hover:border-[#1a1a1a] transition-all"
              aria-label="Next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>

        <Swiper
          onSwiper={(swiper) => {
            swiperRef.current = swiper;
          }}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
          modules={[Navigation, Pagination, Autoplay]}
          spaceBetween={20}
          slidesPerView={1}
          loop={true}
          autoplay={{
            delay: 6000,
            disableOnInteraction: false,
          }}
          breakpoints={{
            640: { slidesPerView: 2 },
            1024: { slidesPerView: 3 },
          }}
        >
          {allTestimonials.map((testimonial, index) => (
            <SwiperSlide key={index} className="h-auto">
              <div className="relative flex flex-col h-full p-6 lg:p-7 bg-white border border-[#e8e2d9] rounded-2xl hover:shadow-lg hover:border-[#c4785a]/30 hover:-translate-y-1 transition-all duration-300">
                <Quote className="absolute top-5 right-5 w-10 h-10 text-[#c4785a]/15" />

                <div className="flex items-center gap-0.5 mb-4">
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

                <p className="text-[#3f3f3f] leading-relaxed mb-6 text-[15px] flex-1">
                  &ldquo;{testimonial.content}&rdquo;
                </p>

                <div className="inline-flex items-center self-start px-3 py-1 bg-[#3d5a3d]/10 rounded-full text-xs font-medium text-[#3d5a3d] mb-5">
                  {testimonial.tripName}
                </div>

                <div className="flex items-center gap-3 pt-5 border-t border-[#e8e2d9]">
                  <Image
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    width={44}
                    height={44}
                    className="rounded-full w-11 h-11 object-cover"
                  />
                  <div>
                    <p className="font-semibold text-[#1a1a1a] text-sm">{testimonial.name}</p>
                    <p className="text-xs text-[#8b8378]">
                      {testimonial.role} · {testimonial.location}
                    </p>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        <div className="flex items-center justify-center gap-1.5 mt-10">
          {allTestimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => swiperRef.current?.slideToLoop(index)}
              className={`h-1.5 rounded-full transition-all ${
                activeIndex === index
                  ? "w-8 bg-[#c4785a]"
                  : "w-1.5 bg-[#e8e2d9] hover:bg-[#c4785a]/40"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
