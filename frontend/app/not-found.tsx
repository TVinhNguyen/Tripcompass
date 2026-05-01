import Link from "next/link";
import type { Metadata } from "next";
import { Compass, MapPin, ArrowLeft } from "lucide-react";

// =============================================================================
// TripCompass — Custom 404 Not Found page
// Source of truth: docs/frontend-review-2026-05-01.md §FE-39
// =============================================================================

export const metadata: Metadata = {
  title: "Trang không tồn tại | TripCompass",
  description: "Trang bạn tìm kiếm không tồn tại hoặc đã bị di chuyển.",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f5f0e8] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Logo */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#d4a853] flex items-center justify-center">
          <Compass className="w-9 h-9 text-[#1a1a1a]" />
        </div>

        {/* 404 */}
        <div className="font-mono text-[80px] leading-none font-bold text-[#e8e2d9] mb-4">
          404
        </div>

        <h1 className="font-serif text-2xl font-semibold text-[#1a1a1a] mb-2">
          Không tìm thấy trang
        </h1>
        <p className="text-[#6b6b6b] mb-8 max-w-xs mx-auto">
          Địa chỉ bạn nhập có thể đã thay đổi hoặc không còn tồn tại.
        </p>

        {/* Links */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white rounded-lg transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Về trang chủ
          </Link>
          <Link
            href="/places"
            className="flex items-center gap-2 px-5 py-2.5 border border-[#e8e2d9] hover:bg-white text-[#1a1a1a] rounded-lg transition-colors text-sm font-medium"
          >
            <MapPin className="w-4 h-4" />
            Khám phá địa điểm
          </Link>
        </div>
      </div>
    </div>
  );
}
