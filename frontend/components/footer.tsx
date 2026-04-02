"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const footerLinks = {
  product: [
    { label: "Kham pha", href: "/explore" },
    { label: "Lap lich trinh", href: "/planner" },
    { label: "Cong dong", href: "/community" },
    { label: "Cam nang", href: "/blog" },
  ],
  destinations: [
    { label: "Ha Noi", href: "/explore?destination=ha-noi" },
    { label: "Da Nang", href: "/explore?destination=da-nang" },
    { label: "Hoi An", href: "/explore?destination=hoi-an" },
    { label: "Phu Quoc", href: "/explore?destination=phu-quoc" },
  ],
  support: [
    { label: "Trung tam ho tro", href: "/help" },
    { label: "Lien he", href: "/contact" },
    { label: "Dieu khoan", href: "/terms" },
    { label: "Bao mat", href: "/privacy" },
  ],
};

export function Footer() {
  return (
    <footer className="relative bg-[#1a1a1a]">
      {/* Top Border */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-5">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <span className="font-serif text-3xl font-bold text-[#d4a853]">T</span>
                <div className="absolute inset-0 border-2 border-[#d4a853] rounded-full" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-serif font-bold text-white tracking-wide">
                  TripCompass
                </span>
                <span className="text-[10px] text-white/40 tracking-[0.2em] uppercase">
                  Vietnam Travel
                </span>
              </div>
            </Link>
            <p className="text-white/50 mb-8 max-w-sm leading-relaxed">
              Kham pha Viet Nam theo cach cua ban. Tao lich trinh hoan hao voi cong nghe AI trong vai phut.
            </p>

            {/* Newsletter */}
            <div>
              <p className="text-sm text-white/70 mb-3">Nhan thong tin moi nhat</p>
              <div className="flex">
                <input
                  type="email"
                  placeholder="Email cua ban"
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-l-lg text-white placeholder-white/40 outline-none focus:border-[#d4a853]/50 transition-colors"
                />
                <button className="px-6 py-3 bg-[#d4a853] text-[#1a1a1a] font-medium rounded-r-lg hover:bg-[#c4985a] transition-colors">
                  Dang ky
                </button>
              </div>
            </div>
          </div>

          {/* Links Columns */}
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            {/* Product Links */}
            <div>
              <h3 className="text-sm text-white/40 uppercase tracking-wider mb-5">
                San pham
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

            {/* Destinations Links */}
            <div>
              <h3 className="text-sm text-white/40 uppercase tracking-wider mb-5">
                Diem den
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

            {/* Support Links */}
            <div>
              <h3 className="text-sm text-white/40 uppercase tracking-wider mb-5">
                Ho tro
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

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/40">
            2024 TripCompass. All rights reserved.
          </p>
          <p className="text-sm text-white/40">
            Made with care in Vietnam
          </p>
        </div>
      </div>
    </footer>
  );
}
