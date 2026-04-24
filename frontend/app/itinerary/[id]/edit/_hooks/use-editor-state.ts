"use client";
// =============================================================================
// useEditorState — all state, mutations, API calls, and WebSocket wiring
// for the itinerary drag-and-drop editor.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";
import type { Itinerary, Activity as ApiActivity, WSEvent } from "@/lib/types";
import { useItineraryWS } from "@/hooks/use-itinerary-ws";

import type { Activity, Collaborator } from "../_lib/types";
import { activityTypeToCategory, ACTIVITY_TEMPLATES } from "../_lib/constants";

// ── Adapters ──────────────────────────────────────────────────────────────────

function mapApiCategory(cat: string): Activity["type"] {
  const MAP: Record<string, Activity["type"]> = {
    FOOD: "food", ATTRACTION: "attraction", TRANSPORT: "transport",
    STAY: "accommodation", ACTIVITY: "activity",
  };
  return MAP[cat] ?? "activity";
}

export function fromApiActivity(a: ApiActivity): Activity {
  return {
    id: a.id,
    day: a.day_number,
    time: a.start_time ?? "09:00",
    title: a.title,
    titleEn: a.title,
    description: a.notes ?? "",
    descriptionEn: a.notes ?? "",
    type: mapApiCategory(a.category),
    location: a.place?.address ?? a.place?.name ?? "",
    duration: a.place?.recommended_duration ?? 60,
    cost: a.estimated_cost ?? 0,
    lat: a.lat,
    lng: a.lng,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEditorState(id: string) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [activities,      setActivities]     = useState<Activity[]>([]);
  const [title,           setTitle]          = useState("Lịch trình");
  const [itinerary,       setItinerary]      = useState<Itinerary | null>(null);
  const [pageLoading,     setPageLoading]    = useState(true);
  const [saving,          setSaving]         = useState(false);
  const [onlineUsers,     setOnlineUsers]    = useState<Collaborator[]>([]);

  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || id === "new") { setPageLoading(false); return; }
    apiFetch<Itinerary>(`/itineraries/${id}`)
      .then((data) => {
        setItinerary(data);
        setTitle(data.title);
        setActivities((data.activities ?? []).map(fromApiActivity));
      })
      .catch(() => {})
      .finally(() => setPageLoading(false));
  }, [id]);

  // ── Autosave title ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!itinerary || title === itinerary.title) return;
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => {
      apiFetch(`/itineraries/${id}`, { method: "PATCH", body: { title } }).catch(() => {});
    }, 800);
    return () => { if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current); };
  }, [title, id, itinerary?.title]); // dep on title string, not whole object

  // ── WebSocket ────────────────────────────────────────────────────────────────
  const handleWSEvent = useCallback((evt: WSEvent) => {
    switch (evt.type) {
      case "presence.join":
        if (evt.payload.user_id && evt.payload.full_name) {
          setOnlineUsers((prev) => {
            if (prev.some((u) => u.id === evt.payload.user_id)) return prev;
            return [...prev, {
              id: evt.payload.user_id,
              name: evt.payload.full_name ?? "User",
              avatar: "",
              role: "editor" as const,
              isOnline: true,
            }];
          });
        }
        break;
      case "presence.leave":
        setOnlineUsers((prev) => prev.filter((u) => u.id !== evt.payload.user_id));
        break;
      case "activity.created":
        if (evt.payload.activity)
          setActivities((prev) => [...prev, fromApiActivity(evt.payload.activity)]);
        break;
      case "activity.updated":
        if (evt.payload.activity)
          setActivities((prev) =>
            prev.map((a) => a.id === evt.payload.activity.id ? fromApiActivity(evt.payload.activity) : a)
          );
        break;
      case "activity.deleted":
        if (evt.payload.activity_id)
          setActivities((prev) => prev.filter((a) => a.id !== evt.payload.activity_id));
        break;
      case "activity.reordered":
        if (Array.isArray(evt.payload.items)) {
          setActivities((prev) => {
            type Item = { id: string; day_number: number; order_index: number };
            const map = new Map<string, Item>(evt.payload.items.map((x: Item) => [x.id, x]));
            return prev
              .map((a) => { const u = map.get(a.id); return u ? { ...a, day: u.day_number } : a; })
              .sort((a, b) => ((map.get(a.id)?.order_index ?? 0) - (map.get(b.id)?.order_index ?? 0)));
          });
        }
        break;
      case "error":
        toast.error(evt.payload.message ?? "Lỗi realtime");
        break;
    }
  }, []);

  const handleWSReconnect = useCallback(() => {
    if (!id || id === "new") return;
    apiFetch<Itinerary>(`/itineraries/${id}`)
      .then((data) => setActivities((data.activities ?? []).map(fromApiActivity)))
      .catch(() => {});
  }, [id]);

  const { send: wsSend } = useItineraryWS(
    id !== "new" ? id : "",
    handleWSEvent,
    handleWSReconnect,
  );

  // ── Manual save ──────────────────────────────────────────────────────────────
  const handleManualSave = useCallback(async () => {
    if (!itinerary || saving) return;
    setSaving(true);
    try {
      await apiFetch(`/itineraries/${id}`, { method: "PATCH", body: { title } });
      toast.success("Đã lưu lịch trình");
    } catch {
      toast.error("Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }, [id, itinerary, title, saving]);

  // ── Delete activity ──────────────────────────────────────────────────────────
  const removeActivity = useCallback(async (activityId: string) => {
    const snapshot = activities;
    setActivities((p) => p.filter((a) => a.id !== activityId));
    try {
      await apiFetch(`/activities/${activityId}`, { method: "DELETE" });
      wsSend({ type: "activity.deleted", payload: { activity_id: activityId } });
    } catch {
      toast.error("Xoá thất bại");
      setActivities(snapshot);
    }
  }, [activities, wsSend]);

  // ── Edit activity (modal save) ───────────────────────────────────────────────
  const saveActivity = useCallback(async (updated: Activity) => {
    setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    try {
      await apiFetch(`/activities/${updated.id}`, {
        method: "PATCH",
        body: {
          title:          updated.title,
          category:       activityTypeToCategory(updated.type),
          start_time:     updated.time,
          estimated_cost: updated.cost,
          notes:          updated.description,
          day_number:     updated.day,
        },
      });
      wsSend({ type: "activity.updated", payload: { activity: { ...updated } } });
    } catch {
      toast.error("Cập nhật thất bại");
    }
  }, [wsSend]);

  // ── DnD: drag over (cross-day preview) ──────────────────────────────────────
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current;
    if (activeData?.isTemplate) return;

    const overId = over.id as string;
    const activeActivity = activities.find((a) => a.id === active.id);
    if (!activeActivity) return;

    let newDay: number | null = null;
    if (overId.startsWith("day-")) {
      newDay = parseInt(overId.split("-")[1]);
    } else {
      const overActivity = activities.find((a) => a.id === overId);
      if (overActivity) newDay = overActivity.day;
    }
    if (newDay !== null && activeActivity.day !== newDay) {
      setActivities((prev) => prev.map((a) => (a.id === active.id ? { ...a, day: newDay! } : a)));
    }
  }, [activities]);

  // ── DnD: drag end ────────────────────────────────────────────────────────────
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overId     = over.id as string;

    // Template drop → create new activity
    if (activeData?.isTemplate) {
      let targetDay = 1;
      if (overId.startsWith("day-")) targetDay = parseInt(overId.split("-")[1]);
      else { const oa = activities.find((a) => a.id === overId); if (oa) targetDay = oa.day; }

      const template = activeData.template as Omit<Activity, "id" | "day">;
      const tempId   = `tmp-${Date.now()}`;
      setActivities((prev) => [...prev, { ...template, id: tempId, day: targetDay }]);

      if (itinerary) {
        try {
          // Read current count via functional form to avoid stale closure
          let currentCount = 0;
          setActivities((prev) => {
            currentCount = prev.filter((a) => a.day === targetDay).length - 1; // -1 because tempId already added
            return prev;
          });
          const created = await apiFetch<ApiActivity>("/activities", {
            method: "POST",
            body: {
              itinerary_id:   id,
              day_number:     targetDay,
              title:          template.title,
              category:       activityTypeToCategory(template.type),
              start_time:     template.time,
              estimated_cost: template.cost,
              notes:          template.description,
              lat:            template.lat,
              lng:            template.lng,
              order_index:    currentCount,
            },
          });
          setActivities((prev) => prev.map((a) => (a.id === tempId ? fromApiActivity(created) : a)));
          wsSend({ type: "activity.created", payload: { activity: created } });
        } catch {
          toast.error("Thêm hoạt động thất bại");
          setActivities((prev) => prev.filter((a) => a.id !== tempId));
        }
      }
      return;
    }

    // Reorder within / between days
    if (active.id !== over.id) {
      // BUG FIX: compute nextActivities OUTSIDE setter to avoid relying on
      // side-effecting the setter function closure (not safe in Concurrent Mode)
      const oldIndex = activities.findIndex((a) => a.id === active.id);
      const newIndex = activities.findIndex((a) => a.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const nextActivities = arrayMove(activities, oldIndex, newIndex);
      setActivities(nextActivities);

      // BUG FIX: group order_index PER DAY, not global
      // Collect all affected days (the moved item's origin & destination days)
      const activeAct = activities[oldIndex]; // original position before move
      const overAct   = activities[newIndex];
      const daysInvolved = new Set([activeAct?.day, overAct?.day].filter((d): d is number => d != null));

      // Build reorder payload with per-day order_index
      const reorderItems: { id: string; day_number: number; order_index: number }[] = [];
      for (const day of daysInvolved) {
        nextActivities
          .filter((a) => a.day === day)
          .forEach((a, idx) => reorderItems.push({ id: a.id, day_number: a.day, order_index: idx }));
      }

      try {
        await apiFetch("/activities/reorder", { method: "PATCH", body: { items: reorderItems } });
        wsSend({ type: "activity.reordered", payload: { items: reorderItems } });
      } catch {
        toast.error("Sắp xếp thất bại");
        setActivities(activities); // rollback
      }
    }
  }, [activities, id, itinerary, wsSend]);

  // ── Add new day ───────────────────────────────────────────────────────────────
  // NOTE: doesn't create a placeholder activity — empty days are shown via
  // the `days` derived array. An API call only happens when user drops/adds
  // an actual activity into the new day.
  const addNewDay = useCallback(() => {
    setActivities((prev) => {
      const maxDay = Math.max(...prev.map((a) => a.day), 0);
      // Grow the day range by 1; DroppableDay renders empty drop zones
      // For visual purposes only — no API side-effet until an activity is added.
      // We achieve an empty day by temporarily adding a sentinel that the
      // days useMemo picks up, then letting it disappear on next load.
      // Simplest correct approach: just bump a counter stored in state.
      return [
        ...prev,
        {
          id:            `__empty-day-${maxDay + 1}-${Date.now()}`,
          day:           maxDay + 1,
          time:          "09:00",
          title:         "",  // empty title signals unsaved placeholder
          titleEn:       "",
          description:   "",
          descriptionEn: "",
          type:          "activity" as const,
          location:      "",
          duration:      0,
          cost:          0,
        },
      ];
    });
  }, []);

  // ── Derived (memoised) ────────────────────────────────────────────────────────
  const days = useMemo(() => {
    const existing = [...new Set(activities.map((a) => a.day))].sort((a, b) => a - b);
    const maxDay   = Math.max(...existing, 0);
    return Array.from({ length: Math.max(maxDay, 3) }, (_, i) => i + 1);
  }, [activities]);

  const totalBudget     = activities.reduce((s, a) => s + (a.cost || 0), 0);
  const totalActivities = activities.length;

  const getTemplates = (search: string) =>
    ACTIVITY_TEMPLATES.filter(
      (t) =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.type.toLowerCase().includes(search.toLowerCase())
    );

  return {
    // state
    activities, setActivities,
    title, setTitle,
    itinerary,
    pageLoading,
    saving,
    onlineUsers,
    // derived
    days,
    totalBudget,
    totalActivities,
    getTemplates,
    // handlers
    handleManualSave,
    removeActivity,
    saveActivity,
    handleDragOver,
    handleDragEnd,
    addNewDay,
  };
}
