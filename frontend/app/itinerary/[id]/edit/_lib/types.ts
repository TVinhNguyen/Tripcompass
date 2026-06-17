import type { EditOp, GenerateResponse } from "@/lib/types";

// Sentinel id prefix for the placeholder row rendered when the user adds an
// empty day. The row lets DroppableDay render the day column before any real
// activity exists, but it is NOT a real activity — exclude it from counts,
// order_index calculations, and totals.
export const EMPTY_DAY_PREFIX = "__empty-day-";
export function isEmptyDaySentinel(a: { id: string }): boolean {
  return a.id.startsWith(EMPTY_DAY_PREFIX);
}

// Local Activity shape used by the drag-and-drop editor
// (Maps from API Activity on load, serialises back on save)
export type Activity = {
  id: string;
  day: number;
  time: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  type: "food" | "attraction" | "transport" | "accommodation" | "activity";
  location: string;
  duration: number;
  cost: number;
  lat?: number;
  lng?: number;
  coverImage?: string;
};

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  plan?: GenerateResponse | null;
  toolCalls?: string[];
  streaming?: boolean;
  error?: boolean;
  // AI-proposed granular edits to the current itinerary + their preview state.
  editOps?: EditOp[] | null;
  editOpsStatus?: "pending" | "applied" | "dismissed";
}

export interface Collaborator {
  id: string;
  name: string;
  avatar: string;
  role: "owner" | "editor" | "viewer";
  isOnline: boolean;
}
