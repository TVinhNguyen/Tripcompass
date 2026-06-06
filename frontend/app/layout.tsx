import type { Metadata, Viewport } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { AppProviders } from '@/components/app-providers'
import './globals.css'

const playfairDisplay = Playfair_Display({ 
  subsets: ["latin", "vietnamese"],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({ 
  subsets: ["latin", "vietnamese"],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TripCompass - Khám Phá Việt Nam | AI-Powered Travel Planning',
  description: 'Lên lịch trình du lịch Việt Nam hoàn hảo với sức mạnh AI. Discover Vietnam with intelligent travel planning.',
  generator: 'v0.app',
  keywords: ['travel', 'vietnam', 'ai', 'trip planning', 'du lịch', 'việt nam'],
  icons: {
    icon: [
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#141414',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${playfairDisplay.variable} ${inter.variable} font-sans antialiased bg-[#f5f0e8] text-[#1a1a1a]`}
      >
        <AppProviders>
          {children}
          <Toaster />
        </AppProviders>
      </body>
    </html>
  )
}
