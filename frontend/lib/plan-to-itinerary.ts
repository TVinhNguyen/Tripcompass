// =============================================================================
// TripCompass — Save AI-generated plan as Itinerary
// Source of truth: docs/integration/03-AI-PLANNER-FLOW.md §4
// =============================================================================

import { apiFetch } from "./api";
import type {
  BudgetCategory,
  BudgetTier,
  CreateActivityInput,
  GenerateResponse,
  Itinerary,
} from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SavePlanMeta = {
  title: string;
  destination: string;
  start_date: string;   // YYYY-MM-DD
  end_date: string;     // YYYY-MM-DD
  budget_vnd: number;
  guest_count: number;
  tags: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierToCategory(tier: BudgetTier): BudgetCategory {
  if (tier === "premium") return "LUXURY";
  if (tier === "survival" || tier === "budget") return "BUDGET";
  return "MODERATE";
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function addDays(date: string, days: number): string {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return formatDate(next);
}

function normalizeSaveMeta(plan: GenerateResponse, meta: SavePlanMeta): SavePlanMeta {
  const firstPlanDate = plan.days?.find((day) => isIsoDate(day.date_str))?.date_str;
  const totalDays = Math.max(plan.days?.length ?? 1, 1);
  const startDate = isIsoDate(meta.start_date)
    ? meta.start_date
    : firstPlanDate ?? formatDate(new Date());
  const endDate = isIsoDate(meta.end_date)
    ? meta.end_date
    : addDays(startDate, totalDays - 1);
  const spent =
    (plan.budget_recap?.attraction_spent_vnd ?? 0) +
    (plan.budget_recap?.food_spent_vnd ?? 0);
  const requestedBudget = Math.max(
    plan.budget_recap?.total_budget_vnd ?? 0,
    spent + Math.max(plan.budget_recap?.remaining_vnd ?? 0, 0),
    spent,
  );
  const budget = Math.max(
    Number.isFinite(meta.budget_vnd) ? meta.budget_vnd : 0,
    requestedBudget,
    1,
  );

  return {
    ...meta,
    start_date: startDate,
    end_date: endDate,
    budget_vnd: budget,
    guest_count: Math.max(meta.guest_count || 1, 1),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Convert a GenerateResponse into a persisted Itinerary + Activities.
 *
 * Flow:
 *  1. POST /itineraries  (create empty itinerary)
 *  2. Loop plan.days[].slots[] → POST /activities for each non-buffer slot
 *     (sequential to respect the (itinerary_id, day_number, order_index) unique constraint)
 *
 * Returns the created Itinerary (with `id` ready for redirect).
 */
export async function savePlanAsItinerary(
  plan: GenerateResponse,
  meta: SavePlanMeta,
): Promise<Itinerary> {
  const safeMeta = normalizeSaveMeta(plan, meta);

  // 1. Create empty itinerary
  const itinerary = await apiFetch<Itinerary>("/itineraries", {
    method: "POST",
    body: {
      title: safeMeta.title,
      destination: safeMeta.destination,
      start_date: safeMeta.start_date,
      end_date: safeMeta.end_date,
      budget: safeMeta.budget_vnd,
      guest_count: safeMeta.guest_count,
      tags: safeMeta.tags,
      budget_category: tierToCategory(plan.budget_tier),
    },
  });

  // 2. Create activities sequentially (preserve order_index uniqueness)
  for (const day of plan.days) {
    let orderIndex = 0;
    for (const slot of day.slots) {
      // Skip genuine transit/buffer slots — those carry no place at all
      // (see streaming/response_shape.py). A prose slot the resolver couldn't
      // match still has a place with a name but an empty id; we persist it as
      // a text-only activity (place_id omitted) so AI-suggested, web-searched
      // venues aren't silently dropped on save.
      if (!slot.place || !slot.place.name) continue;

      const placeId = slot.place.id || undefined;

      const notes = [
        slot.notes,
        slot.combo_covered ? "Đã bao gồm trong combo" : null,
      ].filter(Boolean).join(" — ") || undefined;

      const body: CreateActivityInput = {
        itinerary_id: itinerary.id,
        place_id: placeId,
        day_number: day.day_num,
        order_index: orderIndex++,
        title: slot.place.name,
        category: slot.place.category as CreateActivityInput["category"],
        start_time: slot.start,
        end_time: slot.end,
        estimated_cost: slot.place.base_price,
        lat: slot.place.lat,
        lng: slot.place.lng,
        image_url: slot.place.cover_image,
        notes,
      };

      await apiFetch("/activities", { method: "POST", body });
    }
  }

  return itinerary;
}
