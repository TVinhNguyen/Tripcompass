"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { Search, UserPlus, MoreVertical, Shield, ShieldBan, Mail, Loader2 } from "lucide-react"
import { AdminShell } from "@/components/admin/admin-shell"
import { apiFetch } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type AdminUser = {
  id: string
  name: string
  email: string
  role: "admin" | "editor" | "user"
  itinerary_count: number
  created_at: string
  status: "active" | "suspended"
  avatar_url?: string
}

const roleStyles: Record<string, string> = {
  admin: "bg-[#c4785a]/10 text-[#c4785a]",
  editor: "bg-[#d4a853]/10 text-[#8b6f47]",
  user: "bg-[#3d5a3d]/10 text-[#3d5a3d]",
}

const roleLabel: Record<string, string> = {
  admin: "Quản trị",
  editor: "Biên tập",
  user: "Người dùng",
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<{ data: AdminUser[] }>("/admin/users", {
        query: {
          role: roleFilter !== "all" ? roleFilter : undefined,
          search: search || undefined,
          limit: 50,
        },
      })
      setUsers(res.data ?? [])
    } catch {
      toast.error("Không thể tải danh sách người dùng")
    } finally {
      setLoading(false)
    }
  }, [roleFilter, search])

  useEffect(() => { load() }, [load])

  const handleToggleStatus = async (user: AdminUser) => {
    const newStatus = user.status === "active" ? "suspended" : "active"
    try {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, status: newStatus } : u))
      await apiFetch(`/admin/users/${user.id}/status`, {
        method: "PATCH",
        body: { status: newStatus },
      })
      toast.success(newStatus === "suspended" ? "Đã đình chỉ tài khoản" : "Đã mở khoá tài khoản")
    } catch {
      toast.error("Thao tác thất bại")
      load()
    } finally {
      setMenuOpen(null)
    }
  }

  const handlePromote = async (user: AdminUser) => {
    const newRole = user.role === "user" ? "editor" : user.role === "editor" ? "admin" : "user"
    try {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u))
      await apiFetch(`/admin/users/${user.id}/role`, {
        method: "PATCH",
        body: { role: newRole },
      })
      toast.success(`Đã đổi vai trò thành ${roleLabel[newRole]}`)
    } catch {
      toast.error("Đổi vai trò thất bại")
      load()
    } finally {
      setMenuOpen(null)
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })

  const defaultAvatar = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80"

  return (
    <AdminShell
      title="Người dùng"
      description={`Quản lý ${users.length} tài khoản trên hệ thống`}
      action={
        <button className="px-4 py-2 bg-[#1a1a1a] text-white rounded-lg text-sm font-medium hover:bg-[#3d5a3d] inline-flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Mời người dùng
        </button>
      }
    >
      {/* Filter */}
      <div className="bg-white border border-[#e8e2d9] rounded-2xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8378]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc email..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2.5 bg-[#f5f0e8] border border-[#e8e2d9] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:border-[#3d5a3d]"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="admin">Quản trị</option>
            <option value="editor">Biên tập</option>
            <option value="user">Người dùng</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#3d5a3d]" />
        </div>
      ) : (
        <div className="bg-white border border-[#e8e2d9] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f5f0e8] text-left text-xs uppercase tracking-wider text-[#8b8378]">
                  <th className="px-5 py-3 font-medium">Người dùng</th>
                  <th className="px-5 py-3 font-medium hidden md:table-cell">Vai trò</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Lịch trình</th>
                  <th className="px-5 py-3 font-medium hidden lg:table-cell">Gia nhập</th>
                  <th className="px-5 py-3 font-medium">Trạng thái</th>
                  <th className="px-5 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e2d9]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#f5f0e8]/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Image
                          src={u.avatar_url || defaultAvatar}
                          alt={u.name}
                          width={40} height={40}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-[#1a1a1a] truncate">{u.name}</div>
                          <div className="text-xs text-[#8b8378] truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium", roleStyles[u.role])}>
                        {roleLabel[u.role]}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell text-[#6b6b6b]">{u.itinerary_count} chuyến</td>
                    <td className="px-5 py-4 hidden lg:table-cell text-[#6b6b6b]">{formatDate(u.created_at)}</td>
                    <td className="px-5 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                        u.status === "active" ? "bg-[#3d5a3d]/10 text-[#3d5a3d]" : "bg-[#c94a4a]/10 text-[#c94a4a]",
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", u.status === "active" ? "bg-[#3d5a3d]" : "bg-[#c94a4a]")} />
                        {u.status === "active" ? "Hoạt động" : "Đình chỉ"}
                      </span>
                    </td>
                    <td className="px-5 py-4 relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                        className="p-1.5 rounded-md hover:bg-[#e8e2d9] text-[#6b6b6b]"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpen === u.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                          <div className="absolute right-5 top-12 z-20 w-48 bg-white border border-[#e8e2d9] rounded-lg shadow-lg overflow-hidden">
                            <a
                              href={`mailto:${u.email}`}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f0e8] w-full text-left"
                              onClick={() => setMenuOpen(null)}
                            >
                              <Mail className="w-3.5 h-3.5" />Gửi email
                            </a>
                            <button
                              onClick={() => handlePromote(u)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-[#1a1a1a] hover:bg-[#f5f0e8] w-full text-left"
                            >
                              <Shield className="w-3.5 h-3.5" />Đổi vai trò
                            </button>
                            <button
                              onClick={() => handleToggleStatus(u)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-[#c94a4a] hover:bg-[#c94a4a]/10 w-full text-left"
                            >
                              <ShieldBan className="w-3.5 h-3.5" />
                              {u.status === "active" ? "Đình chỉ" : "Mở khoá"}
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <div className="text-center py-12 text-[#6b6b6b] text-sm">Không tìm thấy người dùng nào</div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  )
}
