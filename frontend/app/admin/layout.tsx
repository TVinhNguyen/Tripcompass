import type { ReactNode } from "react"
import { RequireAdmin } from "@/components/require-auth"

// Single source of truth for /admin/* access control. Wrapping the layout
// instead of each page guarantees new admin routes inherit the guard without
// individual opt-in. Auth state is derived from /auth/me (is_admin claim).
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>
}
