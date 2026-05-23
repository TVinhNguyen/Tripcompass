"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { Menu, X, ArrowUpRight, ChevronDown, MapPin, Route, Utensils, Camera, Hotel, User, LayoutList, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

const exploreSubItems = [
  { href: "/places", label: "Khám phá Địa điểm", description: "Quán ăn, điểm chơi, lưu trú", icon: MapPin },
  { href: "/explore", label: "Khám phá Lịch trình", description: "Lịch trình từ cộng đồng", icon: Route },
]

const navItems = [
  { href: "/planner", label: "Lịch trình của tôi" },
  { href: "/combos", label: "Combo" },
  { href: "/blog", label: "Cẩm nang" },
  { href: "/help", label: "Hướng dẫn" },
]

export function Navigation() {
  const pathname = usePathname()
  const { user, loading, logout } = useAuth()

  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isExploreOpen, setIsExploreOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const isLanding = pathname === "/"
  const needsSolidBg = !isLanding || isScrolled

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50)
    handleScroll()
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const avatarLetter = user?.full_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        needsSolidBg
          ? "bg-[#1a1a1a]/95 backdrop-blur-md border-b border-white/5"
          : "bg-[#1a1a1a]/35 backdrop-blur-md border-b border-white/10 shadow-[0_1px_24px_rgba(0,0,0,0.18)]",
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
              <span className="text-lg font-serif font-semibold text-white tracking-wide">TripCompass</span>
              <span className="text-[10px] text-white/60 tracking-[0.2em] uppercase -mt-1">Vietnam Travel</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            <div
              className="relative"
              onMouseEnter={() => setIsExploreOpen(true)}
              onMouseLeave={() => setIsExploreOpen(false)}
            >
              <button className="flex items-center gap-1 px-4 py-2 text-sm text-white/80 hover:text-white transition-colors rounded-full hover:bg-white/5">
                <span>Khám phá</span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", isExploreOpen && "rotate-180")} />
              </button>

              <AnimatePresence>
                {isExploreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 pt-2 w-72"
                  >
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
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
                              <span className="block text-xs text-white/60 mt-0.5">{item.description}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                      <div className="border-t border-white/10 p-3 bg-white/5">
                        <p className="text-xs text-white/50 mb-2 px-2">Danh mục phổ biến</p>
                        <div className="flex flex-wrap gap-2">
                          <Link href="/places?category=food" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-[#d4a853]/20 rounded-full text-xs text-white/80 hover:text-[#d4a853] transition-colors">
                            <Utensils className="w-3 h-3" /> Ăn uống
                          </Link>
                          <Link href="/places?category=attraction" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-[#d4a853]/20 rounded-full text-xs text-white/80 hover:text-[#d4a853] transition-colors">
                            <Camera className="w-3 h-3" /> Tham quan
                          </Link>
                          <Link href="/places?category=stay" className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-[#d4a853]/20 rounded-full text-xs text-white/80 hover:text-[#d4a853] transition-colors">
                            <Hotel className="w-3 h-3" /> Lưu trú
                          </Link>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  // data-tour anchor for the onboarding tour — only the help
                  // link needs one today, but keying by href keeps it stable
                  // even if labels change.
                  data-tour={item.href === "/help" ? "nav-help" : undefined}
                  className={cn(
                    "relative px-4 py-2 text-sm transition-colors rounded-full",
                    active ? "text-[#d4a853] bg-white/5" : "text-white/80 hover:text-white hover:bg-white/5",
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>

          {/* CTA — Auth-aware */}
          <div className="hidden md:flex items-center gap-3">
            {loading ? (
              <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
            ) : user ? (
              /* ── Logged in: avatar + dropdown ── */
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-white/10 transition-colors"
                >
                  {user.avatar_url ? (
                    <Image src={user.avatar_url} alt={user.full_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#d4a853] flex items-center justify-center text-[#1a1a1a] text-sm font-semibold">
                      {avatarLetter}
                    </div>
                  )}
                  <span className="text-sm text-white/90 max-w-[100px] truncate">{user.full_name || user.email}</span>
                  <ChevronDown className={cn("w-4 h-4 text-white/60 transition-transform", isUserMenuOpen && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {isUserMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                    >
                      <div className="p-1">
                        <Link href="/profile" onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors text-sm">
                          <User className="w-4 h-4" /> Tài khoản
                        </Link>
                        <Link href="/planner" onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-white/80 hover:text-white transition-colors text-sm">
                          <LayoutList className="w-4 h-4" /> Lịch trình của tôi
                        </Link>
                        <div className="h-px bg-white/10 my-1" />
                        <button onClick={() => { setIsUserMenuOpen(false); logout() }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors text-sm">
                          <LogOut className="w-4 h-4" /> Đăng xuất
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              /* ── Not logged in ── */
              <>
                <Link href="/auth/login" className="text-sm text-white/80 hover:text-white transition-colors px-3">
                  Đăng nhập
                </Link>
                <Button
                  asChild
                  className="bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] font-medium px-5 border-0 rounded-full hover:shadow-lg hover:shadow-[#d4a853]/20 transition-all"
                >
                  <Link href="/auth/register" className="flex items-center gap-2">
                    Bắt đầu
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-white"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden py-6 border-t border-white/10 bg-[#1a1a1a]"
            >
              <div className="flex flex-col gap-2">
                {/* Mobile: user info when logged in */}
                {user && (
                  <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10 mb-2">
                    {user.avatar_url ? (
                      <Image src={user.avatar_url} alt={user.full_name} width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#d4a853] flex items-center justify-center text-[#1a1a1a] font-semibold">
                        {avatarLetter}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">{user.full_name}</p>
                      <p className="text-xs text-white/50">{user.email}</p>
                    </div>
                  </div>
                )}

                <div className="px-4 py-2">
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Khám phá</p>
                  {exploreSubItems.map((item) => (
                    <Link key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-2 py-3 text-white/90 hover:text-white hover:bg-white/5 rounded-lg">
                      <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#d4a853]/10 text-[#d4a853]">
                        <item.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className="block text-xs text-white/60">{item.description}</span>
                      </div>
                    </Link>
                  ))}
                </div>
                <div className="h-px bg-white/10 mx-4" />
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center justify-between px-4 py-3 rounded-lg mx-2",
                      "text-white/90 hover:text-white hover:bg-white/5",
                    )}>
                    <span>{item.label}</span>
                    <ArrowUpRight className="w-4 h-4 text-[#d4a853]" />
                  </Link>
                ))}

                <div className="px-4 pt-4 mt-2 border-t border-white/10 flex flex-col gap-2">
                  {user ? (
                    <>
                      <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)}
                        className="w-full py-3 text-center text-white/90 hover:text-white border border-white/20 rounded-full">
                        Tài khoản
                      </Link>
                      <button onClick={() => { setIsMobileMenuOpen(false); logout() }}
                        className="w-full py-3 text-center text-red-400 border border-red-400/30 rounded-full hover:bg-red-400/10 transition-colors">
                        Đăng xuất
                      </button>
                    </>
                  ) : (
                    <>
                      <Link href="/auth/login" onClick={() => setIsMobileMenuOpen(false)}
                        className="w-full py-3 text-center text-white/90 hover:text-white border border-white/20 rounded-full">
                        Đăng nhập
                      </Link>
                      <Button asChild className="w-full bg-[#d4a853] hover:bg-[#c49843] text-[#1a1a1a] font-medium rounded-full">
                        <Link href="/auth/register" className="flex items-center justify-center gap-2">
                          Bắt đầu ngay
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  )
}
