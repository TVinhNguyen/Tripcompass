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
  // 1. Create empty itinerary
  const itinerary = await apiFetch<Itinerary>("/itineraries", {
    method: "POST",
    body: {
      title: meta.title,
      destination: meta.destination,
      start_date: meta.start_date,
      end_date: meta.end_date,
      budget: meta.budget_vnd,
      guest_count: meta.guest_count,
      tags: meta.tags,
      budget_category: tierToCategory(plan.budget_tier),
    },
  });

  // 2. Create activities sequentially (preserve order_index uniqueness)
  for (const day of plan.days) {
    let orderIndex = 0;
    for (const slot of day.slots) {
      // Skip buffer slots & slots without a place
      if (slot.is_buffer || !slot.place) continue;

      const body: CreateActivityInput = {
        itinerary_id: itinerary.id,
        place_id: slot.place.id,
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
        notes: slot.combo_covered ? "Đã bao gồm trong combo" : undefined,
      };

      await apiFetch("/activities", { method: "POST", body });
    }
  }

  return itinerary;
}
