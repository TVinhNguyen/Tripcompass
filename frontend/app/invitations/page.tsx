"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Mail, X } from "lucide-react";
import { Navigation } from "@/components/navigation";
import { RequireAuth } from "@/components/require-auth";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";

type PendingInvite = {
  id: string;
  itinerary_id: string;
  role: "EDITOR" | "VIEWER";
  status: "PENDING" | "ACCEPTED";
};

function InvitationsContent() {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    apiFetch<{ data: PendingInvite[] }>("/collaborators/pending")
      .then((res) => setInvites(res.data ?? []))
      .catch(() => setError("Không tải được danh sách lời mời."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const accept = async (invite: PendingInvite) => {
    setBusyId(invite.id);
    setError("");
    try {
      await apiFetch(`/collaborators/${invite.id}/accept`, { method: "POST" });
      window.location.href = `/itinerary/${invite.itinerary_id}/edit`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không chấp nhận được lời mời.");
      setBusyId(null);
    }
  };

  const decline = async (invite: PendingInvite) => {
    setBusyId(invite.id);
    setError("");
    try {
      await apiFetch(`/collaborators/${invite.id}/decline`, { method: "POST" });
      setInvites((prev) => prev.filter((x) => x.id !== invite.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không từ chối được lời mời.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f0e8]">
      <Navigation />
      <section className="pt-28 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="mb-8">
            <div className="text-[11px] font-mono tracking-[0.24em] uppercase text-[#8b8378]">TripCompass</div>
            <h1 className="mt-2 text-3xl font-serif font-semibold text-[#1a1a1a]">Lời mời cộng tác</h1>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="h-40 flex items-center justify-center rounded-lg border border-[#e0d9cc] bg-white">
              <Loader2 className="w-6 h-6 animate-spin text-[#3d5a3d]" />
            </div>
          ) : invites.length === 0 ? (
            <div className="rounded-lg border border-[#e0d9cc] bg-white p-8 text-center">
              <Mail className="w-8 h-8 mx-auto text-[#8b8378]" />
              <h2 className="mt-4 text-lg font-semibold text-[#1a1a1a]">Không có lời mời nào đang chờ</h2>
              <p className="mt-2 text-sm text-[#6b6b6b]">Các lời mời chỉnh sửa lịch trình sẽ xuất hiện tại đây.</p>
              <Button asChild className="mt-5 bg-[#1a1a1a] hover:bg-[#3d5a3d] text-white">
                <Link href="/planner">Về lịch trình của tôi</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {invites.map((invite) => (
                <div key={invite.id} className="rounded-lg border border-[#e0d9cc] bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono tracking-[0.18em] uppercase text-[#8b8378]">
                      {invite.role === "EDITOR" ? "Biên tập viên" : "Người xem"}
                    </div>
                    <p className="mt-1 text-sm font-medium text-[#1a1a1a] truncate">
                      Lịch trình #{invite.itinerary_id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => decline(invite)}
                      disabled={busyId === invite.id}
                      variant="outline"
                      className="h-9 border-[#e0d9cc] bg-white text-[#1a1a1a]"
                    >
                      <X className="w-4 h-4 mr-1.5" />
                      Từ chối
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => accept(invite)}
                      disabled={busyId === invite.id}
                      className="h-9 bg-[#3d5a3d] hover:bg-[#2d4a2d] text-white"
                    >
                      {busyId === invite.id ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                      Chấp nhận
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function InvitationsPage() {
  return (
    <RequireAuth
      fallback={
        <main className="min-h-screen bg-[#f5f0e8] flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#3d5a3d]" />
        </main>
      }
    >
      <InvitationsContent />
    </RequireAuth>
  );
}
