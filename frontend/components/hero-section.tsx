"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Search,
  ArrowRight,
  MapPin,
  Calendar,
  Users,
} from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-end pb-20 lg:pb-32 overflow-hidden bg-[#1a1a1a]">
      {/* Background Image with artistic crop */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1528127269322-539801943592?w=1920&q=80')",
          }}
        />
        {/* Artistic gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a]/80 via-transparent to-[#1a1a1a]/40" />
      </div>

      {/* Large Typography Overlay */}
      <div className="absolute top-1/4 right-0 transform translate-x-1/4 opacity-[0.03] pointer-events-none select-none hidden lg:block">
        <span className="font-serif text-[40vw] font-bold text-white leading-none">
          VN
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-end">
          {/* Left Column - Main Content */}
          <div>
            {/* Tagline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3 mb-6"
            >
              <div className="w-12 h-px bg-[#d4a853]" />
              <span className="text-sm text-[#d4a853] tracking-[0.2em] uppercase font-medium">
                Khám phá Việt Nam
              </span>
            </motion.div>

            {/* Main Title */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-serif text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-semibold text-white mb-6 leading-[0.9] tracking-tight"
            >
              Hành trình
              <br />
              <span className="text-[#d4a853]">độc đáo</span>
              <br />
              của bạn
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg text-white/60 mb-8 max-w-md leading-relaxed"
            >
              Tạo lịch trình du lịch Việt Nam hoàn hảo với công nghệ AI. Từ Hạ Long đến Phú Quốc, chúng tôi giúp bạn khám phá mọi vùng đất.
            </motion.p>

            {/* Search Bar */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mb-8"
            >
              <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-1.5 hover:border-[#d4a853]/30 transition-colors max-w-xl">
                <div className="flex items-center gap-3 flex-1 px-4">
                  <Search className="w-5 h-5 text-white/40" />
                  <input
                    type="text"
                    placeholder="Bạn muốn đi đâu?"
                    className="flex-1 bg-transparent border-none outline-none py-3 text-white placeholder-white/40"
                  />
                </div>
                <button className="flex items-center gap-2 px-6 py-3 bg-[#d4a853] hover:bg-[#c4985a] text-[#1a1a1a] rounded-full font-medium transition-all">
                  <span>Tìm kiếm</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>

            {/* Quick Stats */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap gap-8"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full">
                  <MapPin className="w-5 h-5 text-[#d4a853]" />
                </div>
                <div>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-white">63</p>
                  <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-0.5">Tỉnh thành</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full">
                  <Calendar className="w-5 h-5 text-[#d4a853]" />
                </div>
                <div>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-white">500+</p>
                  <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-0.5">Lịch trình</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full">
                  <Users className="w-5 h-5 text-[#d4a853]" />
                </div>
                <div>
                  <p className="font-mono tabular-nums text-2xl font-semibold text-white">10k+</p>
                  <p className="text-[10px] text-white/50 tracking-[0.2em] uppercase mt-0.5">Người dùng</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Right Column - Featured Cards */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="hidden lg:block"
          >
            <div className="relative">
              {/* Decorative element */}
              <div className="absolute -top-20 -right-10 w-40 h-40 border border-[#d4a853]/20 rounded-full" />
              <div className="absolute -bottom-10 -left-10 w-24 h-24 border border-[#d4a853]/10 rounded-full" />
              
              {/* Featured Destinations */}
              <div className="space-y-4">
                {[
                  { name: "Vịnh Hạ Long", type: "Di sản UNESCO", image: "https://images.unsplash.com/photo-1528127269322-539801943592?w=400" },
                  { name: "Hội An", type: "Phố cổ", image: "https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=400" },
                  { name: "Sapa", type: "Núi non", image: "https://images.unsplash.com/photo-1570366583862-f91883984fde?w=400" },
                ].map((dest, index) => (
                  <motion.div
                    key={dest.name}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                    whileHover={{ x: -10 }}
                  >
                    <Link
                      href="/explore"
                      className="flex items-center gap-4 p-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:border-[#d4a853]/30 transition-all group"
                    >
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0">
                        <div
                          className="absolute inset-0 bg-cover bg-center transition-transform group-hover:scale-110"
                          style={{ backgroundImage: `url('${dest.image}')` }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-white group-hover:text-[#d4a853] transition-colors tracking-tight">
                          {dest.name}
                        </h3>
                        <p className="text-sm text-white/50">{dest.type}</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-[#d4a853] transition-colors" />
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom Marquee */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-white/5 bg-[#1a1a1a]/80 backdrop-blur-sm overflow-hidden">
        <motion.div
          animate={{ x: [0, -1000] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="flex items-center gap-8 py-4 whitespace-nowrap"
        >
          {Array(3).fill(null).map((_, i) => (
            <div key={i} className="flex items-center gap-8">
              <span className="text-sm text-white/30 tracking-wider">VỊNH HẠ LONG</span>
              <span className="text-[#d4a853]">*</span>
              <span className="text-sm text-white/30 tracking-wider">HỘI AN</span>
              <span className="text-[#d4a853]">*</span>
              <span className="text-sm text-white/30 tracking-wider">SAPA</span>
              <span className="text-[#d4a853]">*</span>
              <span className="text-sm text-white/30 tracking-wider">PHÚ QUỐC</span>
              <span className="text-[#d4a853]">*</span>
              <span className="text-sm text-white/30 tracking-wider">ĐÀ NẴNG</span>
              <span className="text-[#d4a853]">*</span>
              <span className="text-sm text-white/30 tracking-wider">NHA TRANG</span>
              <span className="text-[#d4a853]">*</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
