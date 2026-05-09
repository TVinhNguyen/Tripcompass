"use client";

// =============================================================================
// TripCompass — Global Error Boundary
// Source of truth: docs/frontend-review-2026-05-01.md §FE-39
// =============================================================================

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error monitoring (e.g. Sentry) when available
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <body className="bg-[#f5f0e8] text-[#1a1a1a] font-sans antialiased">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="font-serif text-2xl font-semibold text-[#1a1a1a] mb-2">
              Có lỗi xảy ra
            </h1>
            <p className="text-[#6b6b6b] mb-8">
              Đã có sự cố không mong muốn. Chúng tôi đã ghi nhận lỗi này và sẽ khắc phục sớm.
            </p>
            {error.digest && (
              <p className="text-xs text-[#8b8378] font-mono mb-6">
                Mã lỗi: {error.digest}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={reset}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white rounded-lg transition-colors text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Thử lại
              </button>
              <Link
                href="/"
                className="flex items-center gap-2 px-5 py-2.5 border border-[#e8e2d9] hover:bg-white text-[#1a1a1a] rounded-lg transition-colors text-sm font-medium"
              >
                <Home className="w-4 h-4" />
                Về trang chủ
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
