"use client"
// =============================================================================
// useEditorState — wires the pure editor-reducer to React + IO.
//
// Why this is thin now:
//   • All state transitions live in _lib/editor-reducer.ts (apply + helpers).
//     This hook just orchestrates dispatch + side effects.
//   • IO concerns (REST mutations, WebSocket subscription) live here because
//     they share the same dispatch — splitting them into two hooks would
//     duplicate the `dispatch` plumbing without buying leverage.
//   • The reducer is tested directly without React; the hook only needs a
//     smoke test that wiring is correct.
// =============================================================================

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api"
import type { Itinerary, Activity as ApiActivity, WSEvent } from "@/lib/types"
import { useItineraryWS } from "@/hooks/use-itinerary-ws"

import type { Activity } from "../_lib/types"
import { activityTypeToCategory, ACTIVITY_TEMPLATES } from "../_lib/constants"
import {
  apply,
  initialState,
  deriveDays,
  deriveTotalBudget,
  reorderItemsFor,
  type Action,
} from "../_lib/editor-reducer"

// ── Adapters ──────────────────────────────────────────────────────────────────

function mapApiCategory(cat: string): Activity["type"] {
  const MAP: Record<string, Activity["type"]> = {
    FOOD: "food", ATTRACTION: "attraction", TRANSPORT: "transport",
    STAY: "accommodation", ACTIVITY: "activity",
  }
  return MAP[cat] ?? "activity"
}

export function fromApiActivity(a: ApiActivity): Activity {
  // Coords/description fall back to the linked Place when the activity row
  // doesn't have its own snapshot (AI-planner saves leave lat/lng/notes NULL).
  return {
    id: a.id,
    day: a.day_number,
    time: a.start_time ?? "09:00",
    title: a.title,
    titleEn: a.title,
    description: a.notes ?? a.place?.description ?? "",
    descriptionEn: a.notes ?? a.place?.description ?? "",
    type: mapApiCategory(a.category),
    location: a.place?.address ?? a.place?.name ?? "",
    duration: a.place?.recommended_duration ?? 60,
    cost: a.estimated_cost ?? 0,
    lat: a.lat ?? a.place?.latitude,
    lng: a.lng ?? a.place?.longitude,
    coverImage: a.image_url ?? a.place?.cover_image,
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEditorState(id: string) {
  // Single state machine for activities + presence. setState calls are
  // replaced with dispatch(action) so the transitions are inspectable +
  // testable without rendering React.
  const [state, dispatch] = useReducer(apply, initialState)
  const { activities, onlineUsers } = state

  const [title, setTitle] = useState("Lịch trình")
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || id === "new") {
      setPageLoading(false)
      return
    }
    apiFetch<Itinerary>(`/itineraries/${id}`)
      .then((data) => {
        setItinerary(data)
        setTitle(data.title)
        dispatch({
          kind: "setActivities",
          activities: (data.activities ?? []).map(fromApiActivity),
        })
      })
      .catch(() => {})
      .finally(() => setPageLoading(false))
  }, [id])

  // ── Autosave title ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!itinerary || title === itinerary.title) return
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    titleDebounceRef.current = setTimeout(() => {
      apiFetch<Itinerary>(`/itineraries/${id}`, { method: "PATCH", body: { title } })
        .then((updated) => {
          setItinerary((prev) => prev ? { ...prev, ...updated, activities: prev.activities } : updated)
        })
        .catch(() => {
          toast.error("Không thể lưu tên lịch trình")
        })
    }, 800)
    return () => {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current)
    }
  }, [title, id, itinerary?.title])

  // ── WebSocket → dispatch ───────────────────────────────────────────────────
  const handleWSEvent = useCallback((evt: WSEvent) => {
    const action = wsEventToAction(evt)
    if (action) dispatch(action)
    if (evt.type === "error") toast.error(evt.payload.message ?? "Lỗi realtime")
  }, [])

  const handleWSReconnect = useCallback(() => {
    if (!id || id === "new") return
    // Refetch authoritative state — the WS might have missed events while
    // the socket was down. The reducer accepts the fresh list as a single
    // setActivities action.
    apiFetch<Itinerary>(`/itineraries/${id}`)
      .then((data) =>
        dispatch({
          kind: "setActivities",
          activities: (data.activities ?? []).map(fromApiActivity),
        }),
      )
      .catch(() => {})
  }, [id])

  useItineraryWS(
    itinerary && id !== "new" ? id : "",
    handleWSEvent,
    handleWSReconnect,
  )

  // ── Manual save ────────────────────────────────────────────────────────────
  const handleManualSave = useCallback(async () => {
    if (!itinerary || saving) return
    setSaving(true)
    try {
      const updated = await apiFetch<Itinerary>(`/itineraries/${id}`, { method: "PATCH", body: { title } })
      setItinerary((prev) => prev ? { ...prev, ...updated, activities: prev.activities } : updated)
      toast.success("Đã lưu lịch trình")
    } catch {
      toast.error("Lưu thất bại")
    } finally {
      setSaving(false)
    }
  }, [id, itinerary, title, saving])

  // ── Activity CRUD ──────────────────────────────────────────────────────────
  // Backend broadcasts the WS event itself after every HTTP mutation, so the
  // local dispatch here is purely an optimistic update. On failure we roll
  // back from the snapshot captured before dispatch.
  const removeActivity = useCallback(
    async (activityId: string) => {
      const snapshot = activities
      dispatch({ kind: "removeActivity", id: activityId })
      try {
        await apiFetch(`/activities/${activityId}`, { method: "DELETE" })
      } catch {
        toast.error("Xoá thất bại")
        dispatch({ kind: "setActivities", activities: snapshot })
      }
    },
    [activities],
  )

  const saveActivity = useCallback(async (updated: Activity) => {
    dispatch({ kind: "updateActivity", activity: updated })
    try {
      await apiFetch(`/activities/${updated.id}`, {
        method: "PATCH",
        body: {
          title: updated.title,
          category: activityTypeToCategory(updated.type),
          start_time: updated.time,
          estimated_cost: updated.cost,
          notes: updated.description,
          day_number: updated.day,
        },
      })
    } catch {
      toast.error("Cập nhật thất bại")
    }
  }, [])

  // ── DnD: drag over (cross-day preview) ─────────────────────────────────────
  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event
      if (!over) return
      const activeData = active.data.current
      if (activeData?.isTemplate) return

      const overId = over.id as string
      let newDay: number | null = null
      if (overId.startsWith("day-")) {
        newDay = parseInt(overId.split("-")[1])
      } else {
        const overActivity = activities.find((a) => a.id === overId)
        if (overActivity) newDay = overActivity.day
      }
      if (newDay !== null) {
        dispatch({ kind: "moveActivityToDay", id: active.id as string, day: newDay })
      }
    },
    [activities],
  )

  // ── DnD: drag end ──────────────────────────────────────────────────────────
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return

      const activeData = active.data.current
      const overId = over.id as string

      // Template drop → POST and replace tmp-id with the server row.
      if (activeData?.isTemplate) {
        let targetDay = 1
        if (overId.startsWith("day-")) targetDay = parseInt(overId.split("-")[1])
        else {
          const oa = activities.find((a) => a.id === overId)
          if (oa) targetDay = oa.day
        }
        if (!itinerary) return

        const template = activeData.template as Omit<Activity, "id" | "day">
        const tempId = `tmp-${Date.now()}`
        // Snapshot BEFORE dispatch — used to compute the new activity's
        // order_index per day, and to roll back on failure.
        const snapshot = activities
        const newActivity: Activity = { ...template, id: tempId, day: targetDay }
        dispatch({ kind: "addActivity", activity: newActivity })

        const orderIndex = snapshot.filter((a) => a.day === targetDay).length
        try {
          const created = await apiFetch<ApiActivity>("/activities", {
            method: "POST",
            body: {
              itinerary_id: id,
              day_number: targetDay,
              title: template.title,
              category: activityTypeToCategory(template.type),
              start_time: template.time,
              estimated_cost: template.cost,
              notes: template.description,
              lat: template.lat,
              lng: template.lng,
              order_index: orderIndex,
            },
          })
          dispatch({ kind: "replaceTempActivity", tempId, activity: fromApiActivity(created) })
        } catch {
          toast.error("Thêm hoạt động thất bại")
          dispatch({ kind: "removeActivity", id: tempId })
        }
        return
      }

      // Reorder within / between days.
      if (active.id !== over.id) {
        const snapshot = activities
        dispatch({ kind: "reorder", activeId: active.id as string, overId })

        // Compute the per-day order_index from the *new* layout. The
        // reducer is pure — we re-run apply on the snapshot to derive what
        // it produced rather than reaching for state inside a setter.
        const next = apply(
          { activities: snapshot, onlineUsers },
          { kind: "reorder", activeId: active.id as string, overId },
        ).activities

        const activeAct = snapshot.find((a) => a.id === active.id)
        const overAct = snapshot.find((a) => a.id === overId)
        const daysInvolved = new Set(
          [activeAct?.day, overAct?.day].filter((d): d is number => d != null),
        )
        const items = reorderItemsFor(next, daysInvolved)

        try {
          await apiFetch("/activities/reorder", { method: "PATCH", body: { items } })
        } catch {
          toast.error("Sắp xếp thất bại")
          dispatch({ kind: "setActivities", activities: snapshot })
        }
      }
    },
    [activities, onlineUsers, id, itinerary],
  )

  // ── Add empty day placeholder ──────────────────────────────────────────────
  // Empty days are surfaced via the days[] derived array; the placeholder
  // row exists so DroppableDay has something to render until the user drops
  // a real activity in. The row is filtered out everywhere it would matter
  // by checking `title === ""`.
  const addNewDay = useCallback(() => {
    const maxDay = Math.max(...activities.map((a) => a.day), 0)
    dispatch({
      kind: "addEmptyDayPlaceholder",
      placeholder: {
        id: `__empty-day-${maxDay + 1}-${Date.now()}`,
        day: maxDay + 1,
        time: "09:00",
        title: "",
        titleEn: "",
        description: "",
        descriptionEn: "",
        type: "activity" as const,
        location: "",
        duration: 0,
        cost: 0,
      },
    })
  }, [activities])

  // ── Derived (memoised) ─────────────────────────────────────────────────────
  const days = useMemo(() => deriveDays(activities), [activities])
  const totalBudget = useMemo(() => deriveTotalBudget(activities), [activities])
  const totalActivities = activities.length

  const getTemplates = (search: string) =>
    ACTIVITY_TEMPLATES.filter(
      (t) =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.type.toLowerCase().includes(search.toLowerCase()),
    )

  // setActivities is kept for back-compat with any caller that does ad-hoc
  // mutations — recommended to use a typed action instead.
  const setActivities = useCallback(
    (next: Activity[] | ((prev: Activity[]) => Activity[])) => {
      const value = typeof next === "function" ? next(activities) : next
      dispatch({ kind: "setActivities", activities: value })
    },
    [activities],
  )

  return {
    // state
    activities,
    setActivities,
    title,
    setTitle,
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
  }
}

// ── WS-event → action mapping ────────────────────────────────────────────────
// Kept module-level so unit tests can import it directly: given a WSEvent,
// produce the right reducer action (or null if no state change applies).

function wsEventToAction(evt: WSEvent): Action | null {
  switch (evt.type) {
    case "presence.join":
      if (!evt.payload.user_id || !evt.payload.full_name) return null
      return {
        kind: "presenceJoin",
        user: {
          id: evt.payload.user_id,
          name: evt.payload.full_name,
          avatar: "",
          role: "editor",
          isOnline: true,
        },
      }

    case "presence.leave":
      return { kind: "presenceLeave", userId: evt.payload.user_id }

    case "presence.online":
      if (!Array.isArray(evt.payload)) return null
      return {
        kind: "presenceList",
        users: evt.payload.map((u: { user_id: string; full_name?: string }) => ({
          id: u.user_id,
          name: u.full_name || "User",
          avatar: "",
          role: "editor" as const,
          isOnline: true,
        })),
      }

    case "activity.created":
      if (!evt.payload.activity) return null
      return { kind: "addActivity", activity: fromApiActivity(evt.payload.activity) }

    case "activity.updated":
      if (!evt.payload.activity) return null
      return { kind: "updateActivity", activity: fromApiActivity(evt.payload.activity) }

    case "activity.deleted":
      if (!evt.payload.activity_id) return null
      return { kind: "removeActivity", id: evt.payload.activity_id }

    case "activity.reordered":
      if (!Array.isArray(evt.payload.items)) return null
      return { kind: "applyReorderItems", items: evt.payload.items }

    default:
      return null
  }
}
