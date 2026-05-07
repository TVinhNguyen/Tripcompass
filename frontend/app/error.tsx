"use client";

// =============================================================================
// TripCompass — Route-level Error Boundary (within RootLayout)
// NOTE: Must NOT contain <html> or <body> — those belong in global-error.tsx
// Source of truth: docs/frontend-review-2026-05-01.md §FE-39
// =============================================================================

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 bg-[#f5f0e8]">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-[#1a1a1a] mb-2">
          Có lỗi xảy ra
        </h2>
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
  );
}
