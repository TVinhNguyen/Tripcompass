"use client"

// _hooks/use-admin-users.ts — Encapsulates the /admin/users data flow.
//
// Extracted from page.tsx so the page stays presentation-only and the
// fetch / optimistic-update / refresh logic can be tested without a DOM.
// Self-refreshes useAuth when the operator mutates their own row, so the
// sidebar role pill and RequireAdmin guard see the new state on the next
// render — otherwise an admin who demotes themselves keeps seeing admin
// nav until a hard reload.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/hooks/use-auth"

export type AdminUser = {
  id: string
  name: string
  email: string
  role: "admin" | "editor" | "user"
  status: "active" | "suspended"
  itinerary_count: number
  created_at: string
  avatar_url?: string
}

const SEARCH_DEBOUNCE_MS = 300

const ROLE_CYCLE: Record<AdminUser["role"], AdminUser["role"]> = {
  user: "editor",
  editor: "admin",
  admin: "user",
}

export const roleLabel: Record<AdminUser["role"], string> = {
  admin: "Quản trị",
  editor: "Biên tập",
  user: "Người dùng",
}

export function useAdminUsers() {
  const { user: me, refresh } = useAuth()

  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | AdminUser["role"]>("all")
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  // Debounce: avoid firing N requests per keystroke. Also prevents the LIKE
  // search on the backend (no length cap yet) from being hit on every char.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  // Abort stale requests if the user keeps typing — otherwise late responses
  // from older queries can overwrite the current list.
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const ctl = new AbortController()
    abortRef.current = ctl
    setLoading(true)
    try {
      const res = await apiFetch<{ data: AdminUser[] }>("/admin/users", {
        query: {
          role: roleFilter !== "all" ? roleFilter : undefined,
          search: debouncedSearch || undefined,
          limit: 50,
        },
        signal: ctl.signal,
      })
      if (!ctl.signal.aborted) setUsers(res.data ?? [])
    } catch (err) {
      // AbortError fires when user keeps typing — not a real failure.
      if ((err as Error)?.name !== "AbortError") {
        toast.error("Không thể tải danh sách người dùng")
      }
    } finally {
      if (!ctl.signal.aborted) setLoading(false)
    }
  }, [roleFilter, debouncedSearch])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

  const markPending = (id: string, on: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const isSelf = (u: AdminUser) => me?.id === u.id

  const toggleStatus = async (target: AdminUser) => {
    if (pendingIds.has(target.id)) return
    const newStatus: AdminUser["status"] =
      target.status === "active" ? "suspended" : "active"

    markPending(target.id, true)
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, status: newStatus } : u)))
    try {
      await apiFetch(`/admin/users/${target.id}/status`, {
        method: "PATCH",
        body: { status: newStatus },
      })
      toast.success(newStatus === "suspended" ? "Đã đình chỉ tài khoản" : "Đã mở khoá tài khoản")
    } catch {
      toast.error("Thao tác thất bại")
      load()
    } finally {
      markPending(target.id, false)
    }
  }

  const cyclePromotion = async (target: AdminUser) => {
    if (pendingIds.has(target.id)) return
    const newRole = ROLE_CYCLE[target.role]

    markPending(target.id, true)
    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: newRole } : u)))
    try {
      await apiFetch(`/admin/users/${target.id}/role`, {
        method: "PATCH",
        body: { role: newRole },
      })
      toast.success(`Đã đổi vai trò thành ${roleLabel[newRole]}`)
      // Self-demote / promote: refresh useAuth so the sidebar pill and
      // RequireAdmin gate see the new role without a page reload.
      if (isSelf(target)) await refresh()
    } catch {
      toast.error("Đổi vai trò thất bại")
      load()
    } finally {
      markPending(target.id, false)
    }
  }

  // Stable export shape — keep the page consumer pure.
  return useMemo(
    () => ({
      // state
      users,
      loading,
      search,
      roleFilter,
      pendingIds,
      // setters
      setSearch,
      setRoleFilter,
      // actions
      toggleStatus,
      cyclePromotion,
      reload: load,
      // helpers
      isSelf,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, loading, search, roleFilter, pendingIds],
  )
}
