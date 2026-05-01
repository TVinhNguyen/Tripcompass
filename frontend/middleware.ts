// =============================================================================
// TripCompass — Next.js Middleware (server-side route protection)
// Source of truth: docs/frontend-review-2026-05-01.md §FE-3
//
// Note: middleware only has access to cookies, not localStorage.
// useAuth.persist() must set the cookie in parallel with localStorage.
// =============================================================================

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get("token")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/planner/:path*",
    "/profile/:path*",
    "/saved/:path*",
    "/settings/:path*",
    "/itinerary/new",
    "/itinerary/:id/edit",
    "/ai-planner/:path*",
    "/admin/:path*",
  ],
};
