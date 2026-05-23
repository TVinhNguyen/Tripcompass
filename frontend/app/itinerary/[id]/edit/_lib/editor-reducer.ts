// =============================================================================
// editor-reducer — Pure state transitions for the itinerary edit page.
//
// Why this exists separately from the hook:
//   • The state machine is the same regardless of whether the trigger is a
//     local mutation (user clicks delete) or a remote event (WS broadcast).
//     Both call into apply().
//   • Reorder logic, day-bumping math, and tmp→real id swap are the parts
//     most likely to break — extracting them into pure functions lets the
//     test suite exercise transitions without spinning up React/network.
//   • apply(state, action) is testable with literal inputs:
//        const next = apply(prev, { kind: "remove", id: "a1" })
//     No mocks, no jest.fn(), no router shim.
// =============================================================================

import { arrayMove } from "@dnd-kit/sortable"
import { isEmptyDaySentinel, type Activity, type Collaborator } from "./types"

// ── State ────────────────────────────────────────────────────────────────────

export interface EditorState {
  activities:  Activity[]
  onlineUsers: Collaborator[]
}

export const initialState: EditorState = {
  activities:  [],
  onlineUsers: [],
}

// ── Actions ──────────────────────────────────────────────────────────────────
//
// Discriminated union. Keep `kind` strings short and locality-grouped so a
// new contributor can scan all transitions in one pass.

export type Action =
  // ── load / replace ────────────────────────────────────────────────────────
  | { kind: "setActivities"; activities: Activity[] }

  // ── activity CRUD (used by both local mutations and WS events) ────────────
  | { kind: "addActivity";    activity: Activity }
  | { kind: "updateActivity"; activity: Activity }
  | { kind: "removeActivity"; id: string }
  // After a POST returns the real server activity, swap the optimistic tmp-* row.
  | { kind: "replaceTempActivity"; tempId: string; activity: Activity }

  // ── drag & drop ───────────────────────────────────────────────────────────
  // Cross-day preview while dragging over a different day.
  | { kind: "moveActivityToDay"; id: string; day: number }
  // Final reorder after drag end (within or across days).
  | { kind: "reorder"; activeId: string; overId: string }
  // Apply a server-side reorder broadcast: WS event ships {id, day_number, order_index}.
  | { kind: "applyReorderItems"; items: { id: string; day_number: number; order_index: number }[] }

  // ── empty-day placeholder ─────────────────────────────────────────────────
  // Bumps the day range by one. See addNewDay() — kept as a placeholder row
  // so DroppableDay renders an empty target without an extra "empty days"
  // piece of state.
  | { kind: "addEmptyDayPlaceholder"; placeholder: Activity }

  // ── presence (WS) ─────────────────────────────────────────────────────────
  | { kind: "presenceJoin";  user: Collaborator }
  | { kind: "presenceLeave"; userId: string }
  | { kind: "presenceList";  users: Collaborator[] }

// ── Reducer ──────────────────────────────────────────────────────────────────

export function apply(state: EditorState, action: Action): EditorState {
  switch (action.kind) {
    case "setActivities":
      return { ...state, activities: action.activities }

    case "addActivity": {
      // Dedupe on WS echo: backend broadcasts the same event we just POSTed.
      if (state.activities.some((a) => a.id === action.activity.id)) return state
      // Adding a real activity to a day evicts the `__empty-day-*` sentinel
      // for that day — otherwise totalActivities and reorder math stay off
      // by 1 for the lifetime of the session.
      const next = state.activities.filter(
        (a) => !(isEmptyDaySentinel(a) && a.day === action.activity.day),
      )
      return { ...state, activities: [...next, action.activity] }
    }

    case "updateActivity":
      return {
        ...state,
        activities: state.activities.map((a) =>
          a.id === action.activity.id ? action.activity : a,
        ),
      }

    case "removeActivity":
      return {
        ...state,
        activities: state.activities.filter((a) => a.id !== action.id),
      }

    case "replaceTempActivity":
      return {
        ...state,
        activities: state.activities.map((a) =>
          a.id === action.tempId ? action.activity : a,
        ),
      }

    case "moveActivityToDay": {
      const target = state.activities.find((a) => a.id === action.id)
      if (!target || target.day === action.day) return state
      return {
        ...state,
        activities: state.activities.map((a) =>
          a.id === action.id ? { ...a, day: action.day } : a,
        ),
      }
    }

    case "reorder": {
      const oldIndex = state.activities.findIndex((a) => a.id === action.activeId)
      const newIndex = state.activities.findIndex((a) => a.id === action.overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return state
      return { ...state, activities: arrayMove(state.activities, oldIndex, newIndex) }
    }

    case "applyReorderItems": {
      const map = new Map(action.items.map((x) => [x.id, x]))
      return {
        ...state,
        activities: state.activities
          .map((a) => {
            const u = map.get(a.id)
            return u ? { ...a, day: u.day_number } : a
          })
          .sort(
            (a, b) =>
              (map.get(a.id)?.order_index ?? 0) - (map.get(b.id)?.order_index ?? 0),
          ),
      }
    }

    case "addEmptyDayPlaceholder":
      return {
        ...state,
        activities: [...state.activities, action.placeholder],
      }

    case "presenceJoin":
      if (state.onlineUsers.some((u) => u.id === action.user.id)) return state
      return { ...state, onlineUsers: [...state.onlineUsers, action.user] }

    case "presenceLeave":
      return {
        ...state,
        onlineUsers: state.onlineUsers.filter((u) => u.id !== action.userId),
      }

    case "presenceList":
      return { ...state, onlineUsers: action.users }
  }
}

// ── Derived helpers ──────────────────────────────────────────────────────────
//
// Pure projections — no hooks. The hook wraps these in useMemo; tests call
// them directly.

export function deriveDays(activities: Activity[]): number[] {
  const existing = [...new Set(activities.map((a) => a.day))].sort((a, b) => a - b)
  const maxDay = Math.max(...existing, 0)
  return Array.from({ length: Math.max(maxDay, 3) }, (_, i) => i + 1)
}

export function deriveTotalBudget(activities: Activity[]): number {
  return activities.reduce((s, a) => s + (a.cost || 0), 0)
}

// reorderItemsFor returns the rows the server needs to persist a reorder.
// Pulled out so the drag-end side-effect (which already computed nextActivities)
// can use the same logic the reducer used.
export function reorderItemsFor(
  activities: Activity[],
  daysInvolved: Iterable<number>,
): { id: string; day_number: number; order_index: number }[] {
  const out: { id: string; day_number: number; order_index: number }[] = []
  for (const day of daysInvolved) {
    activities
      .filter((a) => a.day === day)
      .forEach((a, idx) => out.push({ id: a.id, day_number: a.day, order_index: idx }))
  }
  return out
}
