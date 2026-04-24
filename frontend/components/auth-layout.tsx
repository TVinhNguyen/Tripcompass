"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Compass } from "lucide-react"

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle: string
  image?: string
  quote?: { text: string; author: string }
}

export function AuthLayout({
  children,
  title,
  subtitle,
  image = "https://images.unsplash.com/photo-1528127269322-539801943592?w=1200",
  quote = {
    text: "Mỗi chuyến đi là một chương mới. Hãy để TripCompass viết nên hành trình của bạn.",
    author: "TripCompass",
  },
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-[#f5f0e8] flex">
      {/* Left side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <Image src={image || "/placeholder.svg"} alt="TripCompass" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a]/80 via-[#1a1a1a]/50 to-[#3d5a3d]/60" />

        {/* Logo */}
        <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 z-10">
          <div className="w-10 h-10 rounded-full bg-[#d4a853] flex items-center justify-center">
            <Compass className="w-6 h-6 text-[#1a1a1a]" />
          </div>
          <span className="font-serif text-2xl font-bold text-white">TripCompass</span>
        </Link>

        {/* Quote */}
        <div className="relative z-10 mt-auto p-12 text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="w-16 h-px bg-[#d4a853] mb-6" />
            <p className="font-serif text-2xl lg:text-3xl leading-relaxed mb-4 text-balance">
              &ldquo;{quote.text}&rdquo;
            </p>
            <p className="text-white/70 text-sm tracking-widest uppercase">— {quote.author}</p>
          </motion.div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex flex-col px-6 py-10 sm:px-12 lg:px-16">
        {/* Mobile logo */}
        <Link href="/" className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-full bg-[#3d5a3d] flex items-center justify-center">
            <Compass className="w-5 h-5 text-white" />
          </div>
          <span className="font-serif text-xl font-bold text-[#1a1a1a]">TripCompass</span>
        </Link>

        <div className="flex-1 flex items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md mx-auto"
          >
            <div className="mb-8">
              <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#1a1a1a] mb-2 tracking-tight leading-tight">{title}</h1>
              <p className="text-[#6b6b6b]">{subtitle}</p>
            </div>
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
