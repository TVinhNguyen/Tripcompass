"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

const footerLinks = {
  product: [
    { label: "Khám phá", href: "/explore" },
    { label: "AI Planner", href: "/ai-planner" },
    { label: "Lịch trình của tôi", href: "/planner" },
    { label: "Địa điểm", href: "/places" },
    { label: "Cẩm nang", href: "/blog" },
  ],
  destinations: [
    { label: "Hà Nội", href: "/explore?destination=ha-noi" },
    { label: "Đà Nẵng", href: "/explore?destination=da-nang" },
    { label: "Hội An", href: "/explore?destination=hoi-an" },
    { label: "Phú Quốc", href: "/explore?destination=phu-quoc" },
  ],
  support: [
    { label: "Trung tâm hỗ trợ", href: "/help" },
    { label: "Liên hệ", href: "/contact" },
    { label: "Điều khoản", href: "/terms" },
    { label: "Bảo mật", href: "/privacy" },
  ],
};

export function Footer() {
  return (
    <footer className="relative bg-[#1a1a1a]">
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8">
          <div className="lg:col-span-5">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <span className="font-serif text-3xl font-bold text-[#d4a853]">T</span>
                <div className="absolute inset-0 border-2 border-[#d4a853] rounded-full" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-serif font-semibold text-white tracking-wide">
                  TripCompass
                </span>
                <span className="text-[10px] text-white/40 tracking-[0.2em] uppercase">
                  Vietnam Travel
                </span>
              </div>
            </Link>
            <p className="text-white/50 mb-8 max-w-sm leading-relaxed">
              Khám phá Việt Nam theo cách của bạn. Tạo lịch trình hoàn hảo với công nghệ AI trong vài phút.
            </p>

            <Link
              href="/ai-planner"
              className="inline-flex items-center gap-2 rounded-full bg-[#d4a853] px-5 py-3 text-sm font-semibold text-[#1a1a1a] transition-colors hover:bg-[#c4985a]"
            >
              Bắt đầu với AI Planner
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            <div>
              <h3 className="text-sm text-white/40 uppercase tracking-wider mb-5">
                Sản phẩm
              </h3>
              <ul className="space-y-4">
                {footerLinks.product.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group flex items-center gap-1 text-white/70 hover:text-[#d4a853] transition-colors"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm text-white/40 uppercase tracking-wider mb-5">
                Điểm đến
              </h3>
              <ul className="space-y-4">
                {footerLinks.destinations.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group flex items-center gap-1 text-white/70 hover:text-[#d4a853] transition-colors"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm text-white/40 uppercase tracking-wider mb-5">
                Hỗ trợ
              </h3>
              <ul className="space-y-4">
                {footerLinks.support.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group flex items-center gap-1 text-white/70 hover:text-[#d4a853] transition-colors"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-1 translate-x-1 group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 transition-all" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/40">
            © 2026 TripCompass. Tất cả quyền được bảo lưu.
          </p>
          <p className="text-sm text-white/40">
            Được tạo với tình yêu tại Việt Nam
          </p>
        </div>
      </div>
    </footer>
  );
}
