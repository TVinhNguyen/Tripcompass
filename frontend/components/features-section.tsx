"use client";

import { motion } from "framer-motion";
import { Sparkles, Users, Calendar, Wallet, ArrowRight, CheckCircle2 } from "lucide-react";
const features = [
  { icon: "sparkles", title: "AI Thông Minh", description: "Gợi ý lịch trình cá nhân hóa dựa trên sở thích của bạn" },
  { icon: "users", title: "Cộng Đồng", description: "Khám phá và chia sẻ lịch trình với cộng đồng du lịch" },
  { icon: "calendar", title: "Dễ Dàng Lập Kế Hoạch", description: "Kéo thả để tạo lịch trình hoàn hảo trong vài phút" },
  { icon: "wallet", title: "Quản Lý Ngân Sách", description: "Theo dõi chi phí và tối ưu hóa ngân sách chuyến đi" },
];
import Image from "next/image";

const iconMap: Record<string, React.ReactNode> = {
  sparkles: <Sparkles className="w-6 h-6" />,
  users: <Users className="w-6 h-6" />,
  calendar: <Calendar className="w-6 h-6" />,
  wallet: <Wallet className="w-6 h-6" />,
};

const featureHighlights = [
  "Lên lịch trình trong 5 phút",
  "Gợi ý địa điểm theo sở thích",
  "Ước tính chi phí chính xác",
  "Chia sẻ với bạn bè dễ dàng",
];

export function FeaturesSection() {
  return (
    <section className="relative py-24 lg:py-32 bg-[#1a1a1a] overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#d4a853]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#c4785a]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center max-w-3xl mx-auto mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#d4a853]/10 border border-[#d4a853]/20 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-[#d4a853]" />
            <span className="text-sm text-[#d4a853] font-medium">
              Tại sao chọn chúng tôi
            </span>
          </div>
          <h2 className="font-serif text-4xl lg:text-5xl font-semibold text-white mb-6 leading-tight tracking-tight">
            Công nghệ AI kết hợp
            <br />
            <span className="text-[#d4a853]">trải nghiệm địa phương</span>
          </h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Chúng tôi kết hợp trí tuệ nhân tạo với kiến thức địa phương để mang đến lịch trình hoàn hảo nhất cho bạn.
          </p>
        </motion.div>

        {/* Main Content - Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-20">
          {/* Left - Image with Stats */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="relative aspect-[4/3] rounded-3xl overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1528127269322-539801943592?w=800"
                alt="Vietnam Travel"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/80 via-transparent to-transparent" />
              
              {/* Floating Stats Card */}
              <div className="absolute bottom-6 left-6 right-6 p-5 bg-[#1a1a1a]/90 backdrop-blur-sm rounded-2xl border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="text-center">
                    <p className="font-mono tabular-nums text-2xl font-semibold text-[#d4a853]">50K+</p>
                    <p className="text-[10px] text-white/50 tracking-[0.18em] uppercase mt-0.5">Du khách</p>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                  <div className="text-center">
                    <p className="font-mono tabular-nums text-2xl font-semibold text-[#d4a853]">500+</p>
                    <p className="text-[10px] text-white/50 tracking-[0.18em] uppercase mt-0.5">Lịch trình</p>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                  <div className="text-center">
                    <p className="font-mono tabular-nums text-2xl font-semibold text-[#d4a853]">63</p>
                    <p className="text-[10px] text-white/50 tracking-[0.18em] uppercase mt-0.5">Tỉnh thành</p>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                  <div className="text-center">
                    <p className="font-mono tabular-nums text-2xl font-semibold text-[#d4a853]">4.9</p>
                    <p className="text-[10px] text-white/50 tracking-[0.18em] uppercase mt-0.5">Đánh giá</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Decorative Circle */}
            <div className="absolute -top-6 -right-6 w-24 h-24 border-2 border-[#d4a853]/20 rounded-full" />
            <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-[#d4a853]/10 rounded-full" />
          </motion.div>

          {/* Right - Feature List */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <div className="space-y-6">
              {featureHighlights.map((highlight, index) => (
                <motion.div
                  key={highlight}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10 hover:border-[#d4a853]/30 hover:bg-white/10 transition-all"
                >
                  <div className="w-10 h-10 flex items-center justify-center bg-[#d4a853]/20 rounded-full shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-[#d4a853]" />
                  </div>
                  <span className="text-white font-medium">{highlight}</span>
                </motion.div>
              ))}
            </div>

            <motion.a
              href="/explore"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 mt-8 px-6 py-3 bg-[#d4a853] text-[#1a1a1a] rounded-full font-medium hover:bg-[#c4985a] transition-colors group"
            >
              Khám phá ngay
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </motion.a>
          </motion.div>
        </div>

        {/* Features Grid - Bento Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className={`group relative p-8 bg-white/5 border border-white/10 hover:border-[#d4a853]/30 hover:bg-white/10 transition-all duration-300 ${
                index === 0 ? "lg:col-span-2 rounded-3xl" : "rounded-2xl"
              }`}
            >
              {/* Number */}
              <span className="absolute top-6 right-6 text-6xl font-serif font-bold text-white/5 group-hover:text-[#d4a853]/10 transition-colors">
                0{index + 1}
              </span>

              {/* Icon */}
              <div className="w-14 h-14 flex items-center justify-center bg-gradient-to-br from-[#d4a853] to-[#c4985a] rounded-2xl text-[#1a1a1a] mb-6 group-hover:scale-110 transition-transform">
                {iconMap[feature.icon]}
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-white mb-3 tracking-tight">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="text-white/60 leading-relaxed">
                {feature.description}
              </p>

              {/* Hover Arrow */}
              <div className="absolute bottom-6 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-[#d4a853] opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-5 h-5" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
