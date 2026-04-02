import type { Metadata, Viewport } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
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
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
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
    <html lang="vi" className="dark">
      <body className={`${playfairDisplay.variable} ${inter.variable} font-sans antialiased bg-background text-foreground`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
