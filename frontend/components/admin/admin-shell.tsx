"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  MapPin,
  Package,
  Users,
  Database,
  Brain,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Image from "next/image"

const navItems = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, exact: true },
  { href: "/admin/places", label: "Địa điểm", icon: MapPin },
  { href: "/admin/combos", label: "Combo du lịch", icon: Package },
  { href: "/admin/users", label: "Người dùng", icon: Users },
  { href: "/admin/planner-cache", label: "Planner Cache", icon: Database },
  { href: "/admin/knowledge-base", label: "Knowledge Base", icon: Brain },
]

export function AdminShell({ children, title, description, action }: {
  children: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#f5f0e8] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-[#1a1a1a] border-r border-white/5">
        <div className="px-6 py-6 border-b border-white/5">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <span className="font-serif text-2xl font-bold text-[#d4a853]">T</span>
              <div className="absolute inset-0 border-2 border-[#d4a853] rounded-full" />
            </div>
            <div>
              <div className="text-white font-semibold text-sm tracking-tight">TripCompass</div>
              <div className="text-[10px] text-[#d4a853] tracking-[0.2em] uppercase -mt-0.5">Admin panel</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-[#d4a853] text-[#1a1a1a] font-medium"
                    : "text-white/70 hover:text-white hover:bg-white/5",
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-white/5">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" />
            Trở về trang chính
          </Link>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/50"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="w-64 h-full bg-[#1a1a1a] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
              <span className="text-base text-white font-semibold tracking-tight">Admin</span>
              <button onClick={() => setMobileOpen(false)} className="text-white/70">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm",
                      active ? "bg-[#d4a853] text-[#1a1a1a] font-medium" : "text-white/80 hover:bg-white/5",
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#e8e2d9]">
          <div className="flex items-center justify-between px-4 sm:px-6 h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 text-[#1a1a1a] hover:bg-[#f5f0e8] rounded-lg"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="hidden md:flex items-center gap-2 bg-[#f5f0e8] rounded-full px-3 py-1.5 w-72 border border-[#e8e2d9]">
                <Search className="w-4 h-4 text-[#8b8378]" />
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  className="flex-1 bg-transparent text-sm focus:outline-none text-[#1a1a1a] placeholder:text-[#8b8378]"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button className="p-2 text-[#6b6b6b] hover:bg-[#f5f0e8] rounded-lg relative" aria-label="Notifications">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#c4785a] rounded-full" />
              </button>
              <button className="flex items-center gap-2 p-1 hover:bg-[#f5f0e8] rounded-full pr-3">
                <Image
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop"
                  alt="Admin"
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span className="hidden sm:block text-sm text-[#1a1a1a] font-medium">Admin</span>
                <ChevronDown className="hidden sm:block w-4 h-4 text-[#8b8378]" />
              </button>
            </div>
          </div>
        </header>

        {/* Page header */}
        <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-4 bg-white border-b border-[#e8e2d9]">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-[#1a1a1a] tracking-tight">{title}</h1>
              {description && <p className="text-sm text-[#6b6b6b] mt-1">{description}</p>}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}
