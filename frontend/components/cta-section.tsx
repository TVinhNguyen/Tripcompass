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
          <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold text-white mb-6 leading-tight tracking-tight">
            Bắt đầu với
            <br />
            <span className="text-[#d4a853]">lịch trình đầu tiên</span>
          </h2>

          {/* Subtitle */}
          <p className="text-lg text-white/60 mb-12 max-w-2xl mx-auto">
            Nhập điểm đến, số ngày và phong cách du lịch. TripCompass sẽ tạo bản nháp để bạn chỉnh tiếp.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-[#d4a853] hover:bg-[#c4985a] text-[#1a1a1a] border-0 rounded-full px-10 py-6 text-base font-medium transition-all hover:shadow-xl hover:shadow-[#d4a853]/20"
            >
              <Link href="/ai-planner" className="flex items-center gap-3">
                <span>Hỏi AI Planner</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              className="bg-white/10 hover:bg-white/20 text-white border border-white/30 hover:border-white/50 rounded-full px-10 py-6 text-base font-medium transition-all"
            >
              <Link href="/explore">Khám phá cộng đồng</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
