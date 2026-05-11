// =============================================================================
// TripCompass — RequireAuth route guard
// Source of truth: docs/integration/06-FRONTEND-INFRA.md §3
//                  docs/integration/02-AUTH-FLOW.md §5
// =============================================================================

"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useUserNotifications } from "@/hooks/use-user-notifications";

type RequireAuthProps = {
  children: ReactNode;
  /** Optional fallback while auth state is loading (default: null) */
  fallback?: ReactNode;
};

/**
 * Wrap any client component tree that requires authentication.
 *
 * - While auth is loading → renders `fallback` (default: null / skeleton).
 * - If not logged in → redirects `/auth/login?redirect=<current path>`.
 * - Once logged in → renders children.
 *
 * Usage:
 * ```tsx
 * export default function ProtectedPage() {
 *   return (
 *     <RequireAuth>
 *       <PageContent />
 *     </RequireAuth>
 *   );
 * }
 * ```
 */
export function RequireAuth({ children, fallback = null }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const router  = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(
        `/auth/login?redirect=${encodeURIComponent(pathname)}`,
      );
    }
  }, [loading, user, pathname, router]);

  if (loading || !user) return <>{fallback}</>;
  return (
    <>
      <NotificationsBridge />
      {children}
    </>
  );
}

/**
 * Mounts the per-user WS notification channel for the logged-in user.
 * Extracted so the hook only runs once we know `user` is non-null — calling
 * it inside RequireAuth's main body would mount it during the loading state
 * too and open a socket with a stale/empty token.
 */
function NotificationsBridge() {
  useUserNotifications();
  return null;
}

// ---------------------------------------------------------------------------
// RequireAdmin — additionally checks user.role === "admin"
// ---------------------------------------------------------------------------

type RequireAdminProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

export function RequireAdmin({ children, fallback = null }: RequireAdminProps) {
  const { user, loading } = useAuth();
  const router  = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
      } else if (user.role !== "admin") {
        router.replace("/");
      }
    }
  }, [loading, user, pathname, router]);

  if (loading || !user || user.role !== "admin") return <>{fallback}</>;
  return <>{children}</>;
}
