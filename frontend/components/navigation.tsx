"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ArrowUpRight, ChevronDown, MapPin, Route, Utensils, Camera, Hotel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const exploreSubItems = [
  { 
    href: "/places", 
    label: "Khám phá Địa điểm", 
    description: "Quán ăn, điểm chơi, lưu trú",
    icon: MapPin 
  },
  { 
    href: "/explore", 
    label: "Khám phá Lịch trình", 
    description: "Lịch trình từ cộng đồng",
    icon: Route 
  },
];

const navItems = [
  { href: "/planner", label: "Lịch trình của tôi" },
  { href: "/blog", label: "Cẩm nang" },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isExploreOpen, setIsExploreOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        isScrolled
          ? "bg-[#1a1a1a]/95 backdrop-blur-md"
          : "bg-transparent"
      )}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <span className="font-serif text-2xl font-bold text-[#d4a853]">T</span>
              <div className="absolute inset-0 border-2 border-[#d4a853] rounded-full scale-100 group-hover:scale-110 transition-transform" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-serif font-bold text-white tracking-wide">
                TripCompass
              </span>
              <span className="text-[10px] text-white/50 tracking-[0.2em] uppercase -mt-1">
                Vietnam Travel
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {/* Explore Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setIsExploreOpen(true)}
              onMouseLeave={() => setIsExploreOpen(false)}
            >
              <button
                className="flex items-center gap-1 px-5 py-2 text-sm text-white/70 hover:text-white transition-colors group"
              >
                <span className="relative z-10">Khám phá</span>
                <ChevronDown className={cn(
                  "w-4 h-4 transition-transform",
                  isExploreOpen && "rotate-180"
                )} />
                <span className="absolute inset-0 bg-white/5 rounded-full scale-0 group-hover:scale-100 transition-transform" />
              </button>

              <AnimatePresence>
                {isExploreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 mt-2 w-72 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-xl overflow-hidden"
                  >
                    <div className="p-2">
                      {exploreSubItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                        >
                          <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#d4a853]/10 text-[#d4a853] group-hover:bg-[#d4a853]/20 transition-colors">
                            <item.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="block text-sm font-medium text-white group-hover:text-[#d4a853] transition-colors">
                              {item.label}
                            </span>
                            <span className="block text-xs text-white/50 mt-0.5">
                              {item.description}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                    
                    {/* Quick Links */}
                    <div className="border-t border-white/10 p-3 bg-white/5">
                      <p className="text-xs text-white/40 mb-2 px-2">Danh mục phổ biến</p>
                      <div className="flex flex-wrap gap-2">
                        <Link href="/places?category=food" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-[#d4a853]/20 rounded-full text-xs text-white/70 hover:text-[#d4a853] transition-colors">
                          <Utensils className="w-3 h-3" />
                          Ăn uống
                        </Link>
                        <Link href="/places?category=attraction" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-[#d4a853]/20 rounded-full text-xs text-white/70 hover:text-[#d4a853] transition-colors">
                          <Camera className="w-3 h-3" />
                          Tham quan
                        </Link>
                        <Link href="/places?category=stay" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-[#d4a853]/20 rounded-full text-xs text-white/70 hover:text-[#d4a853] transition-colors">
                          <Hotel className="w-3 h-3" />
                          Lưu trú
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="relative px-5 py-2 text-sm text-white/70 hover:text-white transition-colors group"
              >
                <span className="relative z-10">{item.label}</span>
                <span className="absolute inset-0 bg-white/5 rounded-full scale-0 group-hover:scale-100 transition-transform" />
              </Link>
            ))}
          </div>

          {/* CTA Button */}
          <div className="hidden md:block">
            <Button
              asChild
              className="bg-[#d4a853] hover:bg-[#c4985a] text-[#1a1a1a] font-medium px-6 border-0 rounded-full shadow-none hover:shadow-lg hover:shadow-[#d4a853]/20 transition-all"
            >
              <Link href="/planner" className="flex items-center gap-2">
                <span>Bắt đầu</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-white"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden py-6 border-t border-white/10 bg-[#1a1a1a]"
          >
            <div className="flex flex-col gap-2">
              {/* Explore Section */}
              <div className="px-4 py-2">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Khám phá</p>
                {exploreSubItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-2 py-3 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#d4a853]/10 text-[#d4a853]">
                      <item.icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="block text-xs text-white/50">{item.description}</span>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="h-px bg-white/10 mx-4" />

              {navItems.map((item, index) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-between px-4 py-3 text-white/80 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <span className="text-lg">{item.label}</span>
                    <ArrowUpRight className="w-4 h-4 text-[#d4a853]" />
                  </Link>
                </motion.div>
              ))}
              <div className="px-4 pt-4 mt-2 border-t border-white/10">
                <Button
                  asChild
                  className="w-full bg-[#d4a853] hover:bg-[#c4985a] text-[#1a1a1a] font-medium rounded-full"
                >
                  <Link href="/planner" className="flex items-center justify-center gap-2">
                    <span>Bắt đầu ngay</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </nav>
    </motion.header>
  );
}
