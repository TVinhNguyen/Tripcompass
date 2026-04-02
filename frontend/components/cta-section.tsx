"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CTASection() {
  return (
    <section className="relative py-24 lg:py-32 bg-[#1a1a1a] overflow-hidden">
      {/* Large Background Text */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none">
        <span className="font-serif text-[25vw] font-bold text-white/[0.02] leading-none whitespace-nowrap">
          VIETNAM
        </span>
      </div>

      {/* Background Decorations */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#d4a853]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#c4785a]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center"
        >
          {/* Decorative Line */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="w-20 h-px bg-[#d4a853]/30" />
            <span className="text-sm text-[#d4a853] tracking-[0.3em] uppercase">
              Bắt đầu ngay
            </span>
            <div className="w-20 h-px bg-[#d4a853]/30" />
          </div>

          {/* Title */}
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Sẵn sàng cho
            <br />
            <span className="text-[#d4a853]">cuộc phiêu lưu</span> mới?
          </h2>

          {/* Subtitle */}
          <p className="text-lg text-white/60 mb-12 max-w-2xl mx-auto">
            Hãy để chúng tôi giúp bạn tạo nên hành trình tuyệt vời nhất. Miễn phí, đơn giản và đầy cảm hứng.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-[#d4a853] hover:bg-[#c4985a] text-[#1a1a1a] border-0 rounded-full px-10 py-6 text-base font-medium transition-all hover:shadow-xl hover:shadow-[#d4a853]/20"
            >
              <Link href="/planner" className="flex items-center gap-3">
                <span>Tạo lịch trình</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 text-white hover:bg-white hover:text-[#1a1a1a] rounded-full px-10 py-6 text-base font-medium transition-all"
            >
              <Link href="/explore">Khám phá cộng đồng</Link>
            </Button>
          </div>

          {/* Trust Indicators */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            viewport={{ once: true }}
            className="mt-16 pt-16 border-t border-white/10"
          >
            <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-sm text-white/50">
              <div className="flex items-center gap-2">
                <span className="font-serif text-2xl font-bold text-[#d4a853]">10,000+</span>
                <span>Người dùng</span>
              </div>
              <div className="w-px h-6 bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="font-serif text-2xl font-bold text-[#d4a853]">500+</span>
                <span>Lịch trình</span>
              </div>
              <div className="w-px h-6 bg-white/10 hidden sm:block" />
              <div className="flex items-center gap-2">
                <span className="font-serif text-2xl font-bold text-[#d4a853]">63</span>
                <span>Tỉnh thành</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
