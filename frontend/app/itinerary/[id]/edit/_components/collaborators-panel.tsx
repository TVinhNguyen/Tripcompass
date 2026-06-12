"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { Crown, Eye, Loader2, Mail, Pencil, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Collaborator } from "../_lib/types";

type ApiCollaboratorRole = "EDITOR" | "VIEWER";
type ApiCollaboratorStatus = "PENDING" | "ACCEPTED";

type ApiCollaborator = {
  id: string;
  itinerary_id: string;
  user_id?: string | null;
  user?: {
    id: string;
    email: string;
    full_name: string;
    avatar_url?: string | null;
  } | null;
  email?: string | null;
  invited_by: string;
  role: ApiCollaboratorRole;
  status: ApiCollaboratorStatus;
  joined_at?: string | null;
};

type MemberRow = {
  id: string;
  collaboratorId?: string;
  userId?: string | null;
  name: string;
  email?: string;
  avatar?: string | null;
  role: "owner" | "editor" | "viewer";
  rawRole?: ApiCollaboratorRole;
  status: "OWNER" | ApiCollaboratorStatus;
  isOnline: boolean;
  isCurrentUser: boolean;
};

const ROLE_ICONS: Record<MemberRow["role"], ReactNode> = {
  owner: <Crown className="w-3 h-3 text-[#d4a853]" />,
  editor: <Pencil className="w-3 h-3 text-[#3d5a3d]" />,
  viewer: <Eye className="w-3 h-3 text-[#8b8378]" />,
};

const ROLE_LABELS: Record<MemberRow["role"], string> = {
  owner: "Chủ sở hữu",
  editor: "Có thể chỉnh sửa",
  viewer: "Chỉ xem",
};

const INVITE_ROLE_LABELS: Record<ApiCollaboratorRole, string> = {
  EDITOR: "chỉnh sửa",
  VIEWER: "chỉ xem",
};

function initialOf(value: string) {
  return value.trim().charAt(0).toUpperCase() || "?";
}

function toMemberRole(role: ApiCollaboratorRole): "editor" | "viewer" {
  return role === "EDITOR" ? "editor" : "viewer";
}

export function CollaboratorsPanel({
  collaborators,
  itineraryId,
  ownerId,
}: {
  collaborators: Collaborator[];
  itineraryId: string;
  ownerId?: string;
}) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ApiCollaboratorRole>("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "sent" | "error">("idle");
  const [members, setMembers] = useState<ApiCollaborator[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [roleStatus, setRoleStatus] = useState<"idle" | "updated" | "removed" | "error">("idle");

  const isOwner = !!user && !!ownerId && user.id === ownerId;

  const loadCollaborators = useCallback(async () => {
    if (!itineraryId || itineraryId === "new") return;
    setLoadingMembers(true);
    setLoadError(false);
    try {
      const res = await apiFetch<{ data: ApiCollaborator[] }>(`/itineraries/${itineraryId}/collaborators`);
      setMembers(res.data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMembers(false);
    }
  }, [itineraryId]);

  useEffect(() => {
    void loadCollaborators();
  }, [loadCollaborators]);

  const onlineById = useMemo(() => {
    return new Map(collaborators.map((c) => [c.id, c]));
  }, [collaborators]);

  const memberRows = useMemo<MemberRow[]>(() => {
    const rows: MemberRow[] = [];

    if (isOwner && user) {
      rows.push({
        id: `owner-${user.id}`,
        userId: user.id,
        name: user.full_name || user.email,
        email: user.email,
        avatar: user.avatar_url,
        role: "owner",
        status: "OWNER",
        isOnline: true,
        isCurrentUser: true,
      });
    }

    for (const member of members) {
      const userId = member.user_id ?? member.user?.id ?? null;
      const onlineUser = userId ? onlineById.get(userId) : undefined;
      const name = member.user?.full_name ?? member.email ?? "Người được mời";

      rows.push({
        id: member.id,
        collaboratorId: member.id,
        userId,
        name: onlineUser?.name ?? name,
        email: member.user?.email ?? member.email ?? undefined,
        avatar: member.user?.avatar_url ?? onlineUser?.avatar,
        role: toMemberRole(member.role),
        rawRole: member.role,
        status: member.status,
        isOnline: !!onlineUser,
        isCurrentUser: !!userId && userId === user?.id,
      });
    }

    return rows;
  }, [isOwner, members, onlineById, user]);

  const online = collaborators.filter((c) => c.isOnline);

  const inviteCollaborator = async () => {
    const trimmed = email.trim();
    if (!trimmed || inviting || !isOwner) return;
    setInviting(true);
    setInviteStatus("idle");
    setRoleStatus("idle");

    try {
      await apiFetch(`/itineraries/${itineraryId}/collaborators`, {
        method: "POST",
        body: { email: trimmed, role: inviteRole },
      });
      setEmail("");
      setInviteStatus("sent");
      await loadCollaborators();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setInviteStatus("sent");
        await loadCollaborators();
      } else {
        setInviteStatus("error");
      }
    } finally {
      setInviting(false);
    }
  };

  const updateRole = async (collaboratorId: string, role: ApiCollaboratorRole) => {
    if (!isOwner || updatingRoleId) return;
    setUpdatingRoleId(collaboratorId);
    setRoleStatus("idle");
    try {
      const updated = await apiFetch<ApiCollaborator>(`/collaborators/${collaboratorId}/role`, {
        method: "PATCH",
        body: { role },
      });
      setMembers((prev) => prev.map((member) => (member.id === updated.id ? updated : member)));
      setRoleStatus("updated");
    } catch {
      setRoleStatus("error");
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const removeCollaborator = async (collaboratorId: string) => {
    if (!isOwner || removingId) return;
    setRemovingId(collaboratorId);
    setRoleStatus("idle");
    try {
      await apiFetch(`/collaborators/${collaboratorId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((member) => member.id !== collaboratorId));
      setRoleStatus("removed");
    } catch {
      setRoleStatus("error");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 h-9 px-2.5 rounded-md hover:bg-[#eeeae1] transition-colors">
          <div className="flex -space-x-2">
            {online.slice(0, 3).map((c) => (
              c.avatar
                ? (
                  <div key={c.id} className="relative w-6 h-6 rounded-full border-2 border-[#fbf8f2] overflow-hidden">
                    <Image src={c.avatar} alt={c.name} fill className="object-cover" />
                  </div>
                )
                : (
                  <div
                    key={c.id}
                    className="w-6 h-6 rounded-full border-2 border-[#fbf8f2] bg-[#3d5a3d] flex items-center justify-center text-[10px] font-bold text-white"
                  >
                    {initialOf(c.name)}
                  </div>
                )
            ))}
          </div>
          <span className="text-xs text-[#6b6b6b] hidden sm:inline nums">
            {online.length} online
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-[22rem] bg-white border-[#e0d9cc] p-0 shadow-xl">
        <div className="p-4 border-b border-[#e8e2d9]">
          <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-[#8b8378]">Collaborators</div>
          <h3 className="font-semibold text-[#1a1a1a] mt-1">{memberRows.length} thành viên</h3>
        </div>

        <div className="p-2 max-h-72 overflow-y-auto">
          {loadingMembers && (
            <div className="flex items-center justify-center gap-2 text-xs text-[#8b8378] py-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Đang tải cộng tác viên
            </div>
          )}

          {!loadingMembers && loadError && (
            <p className="text-center text-xs text-red-600 py-4">Không tải được danh sách cộng tác viên.</p>
          )}

          {!loadingMembers && !loadError && memberRows.length === 0 && (
            <p className="text-center text-xs text-[#8b8378] py-4">Chưa có cộng tác viên</p>
          )}

          {memberRows.map((member) => (
            <div key={member.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-[#f5f0e8]">
              <div className="relative">
                {member.avatar
                  ? <Image src={member.avatar} alt={member.name} width={32} height={32} className="rounded-full w-8 h-8 object-cover" />
                  : (
                    <div className="w-8 h-8 rounded-full bg-[#3d5a3d] flex items-center justify-center text-sm font-bold text-white">
                      {initialOf(member.name)}
                    </div>
                  )
                }
                {member.isOnline && (
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-[#3d5a3d] rounded-full border-2 border-white" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-medium text-[#1a1a1a] truncate">{member.name}</p>
                  {member.isCurrentUser && (
                    <span className="shrink-0 rounded-full bg-[#d4a853]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#8b6f47]">
                      Bạn
                    </span>
                  )}
                  {member.status === "PENDING" && (
                    <span className="shrink-0 rounded-full bg-[#f5f0e8] px-1.5 py-0.5 text-[10px] text-[#8b8378]">
                      Đang mời
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-[#8b8378]">
                  {ROLE_ICONS[member.role]}
                  <span>{ROLE_LABELS[member.role]}</span>
                </div>
                {member.email && (
                  <p className="truncate text-[11px] text-[#b8b1a6]">{member.email}</p>
                )}
              </div>

              {isOwner && member.collaboratorId && member.rawRole ? (
                <div className="flex items-center gap-1">
                  <select
                    value={member.rawRole}
                    disabled={updatingRoleId === member.collaboratorId || removingId === member.collaboratorId}
                    onChange={(event) => updateRole(member.collaboratorId!, event.target.value as ApiCollaboratorRole)}
                    className="h-8 rounded-md border border-[#e0d9cc] bg-white px-2 text-xs text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#d4a853]/30"
                    aria-label={`Đổi quyền của ${member.name}`}
                  >
                    <option value="EDITOR">Biên tập</option>
                    <option value="VIEWER">Chỉ xem</option>
                  </select>
                  <button
                    type="button"
                    disabled={removingId === member.collaboratorId}
                    onClick={() => removeCollaborator(member.collaboratorId!)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-[#e0d9cc] bg-white text-[#8b8378] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                    aria-label={`Xóa ${member.name} khỏi lịch trình`}
                    title="Xóa khỏi lịch trình"
                  >
                    {removingId === member.collaboratorId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ) : (
                !member.isOnline && <span className="text-[10px] text-[#b8b1a6] nums">OFFLINE</span>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-[#e8e2d9] bg-[#f5f0e8]">
          {isOwner ? (
            <>
              <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-[#8b8378]">Mời cộng tác</div>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {(["EDITOR", "VIEWER"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      setInviteRole(role);
                      setInviteStatus("idle");
                    }}
                    className={cn(
                      "h-8 rounded-md border text-xs font-medium transition",
                      inviteRole === role
                        ? "border-[#3d5a3d] bg-[#3d5a3d] text-white"
                        : "border-[#e0d9cc] bg-white text-[#6b6b6b] hover:text-[#1a1a1a]",
                    )}
                  >
                    {role === "EDITOR" ? "Biên tập" : "Chỉ xem"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2 min-w-0">
                <div className="min-w-0 flex-1 flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-md border border-[#e0d9cc]">
                  <Mail className="w-3.5 h-3.5 text-[#8b8378] shrink-0" />
                  <input
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setInviteStatus("idle");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        inviteCollaborator();
                      }
                    }}
                    type="email"
                    placeholder="email@example.com"
                    className="min-w-0 flex-1 bg-transparent text-xs text-[#1a1a1a] placeholder:text-[#8b8378] focus:outline-none"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={inviteCollaborator}
                  disabled={inviting || !email.trim()}
                  className="bg-[#1a1a1a] hover:bg-black text-[#f5f0e8] shrink-0 h-8"
                >
                  {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                </Button>
              </div>
              {inviteStatus === "sent" && (
                <p className="mt-2 text-[11px] text-[#3d5a3d]">Đã gửi lời mời {INVITE_ROLE_LABELS[inviteRole]}.</p>
              )}
              {inviteStatus === "error" && (
                <p className="mt-2 text-[11px] text-red-600">Không gửi được lời mời. Kiểm tra email hoặc quyền sở hữu.</p>
              )}
              {roleStatus === "updated" && (
                <p className="mt-2 text-[11px] text-[#3d5a3d]">Đã cập nhật quyền cộng tác viên.</p>
              )}
              {roleStatus === "removed" && (
                <p className="mt-2 text-[11px] text-[#3d5a3d]">Đã xóa cộng tác viên khỏi lịch trình.</p>
              )}
              {roleStatus === "error" && (
                <p className="mt-2 text-[11px] text-red-600">Không thực hiện được thao tác. Chỉ chủ sở hữu mới được thay đổi cộng tác viên.</p>
              )}
            </>
          ) : (
            <p className="text-[11px] text-[#6b6b6b] leading-relaxed">
              Chỉ chủ sở hữu mới được mời hoặc thay đổi quyền cộng tác viên.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
