// =============================================================================
// TripCompass — Shared TypeScript Types
// Source of truth: docs/integration/06-FRONTEND-INFRA.md §6
// =============================================================================

// ---------------------------------------------------------------------------
// Auth & User
// ---------------------------------------------------------------------------

export type User = {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  bio?: string;
  phone?: string;
  is_admin?: boolean;
  status?: "UNVERIFIED" | "ACTIVE" | "BANNED";
  created_at: string;
};

// ---------------------------------------------------------------------------
// Place
// ---------------------------------------------------------------------------

export type PlaceCategory = "ATTRACTION" | "FOOD" | "STAY";

export type Place = {
  id: string;
  destination: string;
  category: PlaceCategory;
  name: string;
  name_en?: string;
  description?: string;
  address?: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  cover_image?: string;
  images: string[];
  rating?: number;
  review_count: number;
  must_visit: boolean;
  priority_score: number;
  best_time_of_day?: string;
  tags: string[];
  hours?: string;                // free-text opening hours, e.g. "08:00–22:00"
  recommended_duration?: number; // minutes
  base_price?: number;           // VND
  phone?: string;
  website?: string;
  parent_id?: string;
  sub_attractions?: string[];
  source_url?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type DestinationStat = {
  name: string;
  slug: string;
  count: number;
};

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export type ActivityCategory = "ATTRACTION" | "FOOD" | "STAY" | "TRANSPORT" | "ACTIVITY";

export type Activity = {
  id: string;
  itinerary_id: string;
  place_id?: string;
  place?: Place;
  day_number: number;
  order_index: number;
  title: string;
  category: ActivityCategory;
  lat?: number;
  lng?: number;
  estimated_cost: number; // VND
  start_time?: string;    // HH:MM
  end_time?: string;      // HH:MM
  image_url?: string;
  notes?: string;
};

// ---------------------------------------------------------------------------
// Itinerary
// ---------------------------------------------------------------------------

export type ItineraryStatus = "DRAFT" | "PUBLISHED";
export type BudgetCategory = "BUDGET" | "MODERATE" | "LUXURY";

export type Itinerary = {
  id: string;
  owner_id: string;
  title: string;
  destination: string;
  budget: number;           // VND
  start_date: string;       // YYYY-MM-DD
  end_date: string;         // YYYY-MM-DD
  status: ItineraryStatus;
  cover_image_url?: string;
  rating: number;
  view_count: number;
  clone_count: number;
  cloned_from_id?: string;
  guest_count: number;
  tags: string[];
  budget_category: BudgetCategory;
  created_at: string;
  updated_at?: string;
  activities?: Activity[];
};

export type CreateItineraryInput = {
  title: string;
  destination: string;
  budget: number;
  start_date: string;
  end_date: string;
  guest_count: number;
  tags?: string[];
  budget_category?: BudgetCategory;
  cover_image_url?: string;
  cloned_from_id?: string;
};

export type UpdateItineraryInput = Partial<Omit<CreateItineraryInput, "cloned_from_id">>;

// ---------------------------------------------------------------------------
// Activity inputs
// ---------------------------------------------------------------------------

export type CreateActivityInput = {
  itinerary_id: string;
  place_id?: string;
  day_number: number;
  order_index: number;
  title: string;
  category: ActivityCategory;
  start_time?: string;
  end_time?: string;
  estimated_cost?: number;
  lat?: number;
  lng?: number;
  image_url?: string;
  notes?: string;
};

export type UpdateActivityInput = Partial<Omit<CreateActivityInput, "itinerary_id">>;

export type ReorderItem = { id: string; day_number: number; order_index: number };

// ---------------------------------------------------------------------------
// Combo — mirrors backend models.Combo exactly (do NOT add fields the DB
// doesn't have; previous drift caused silent data loss on save).
// ---------------------------------------------------------------------------

export type Combo = {
  id: string;
  destination: string;
  name: string;
  cover_image?: string;
  provider?: string;
  price_per_person?: number;
  includes?: string[];
  benefits?: string[];
  duration_days?: number;
  requires_overnight?: boolean;
  book_url?: string;
  price_updated_at?: string;
  created_at?: string;
  updated_at?: string;
};

// ---------------------------------------------------------------------------
// Planner — GenerateRequest / GenerateResponse
// (maps to backend /api/v1/planner/generate and planner-ai /plan)
// ---------------------------------------------------------------------------

export type GenerateRequest = {
  destination: string;
  start_date: string;
  end_date: string;
  budget_vnd: number;
  guest_count?: number;
  preference_tags?: string[];
  required_places?: string[];
  travel_style?: "relaxed" | "balanced" | "standard" | "active";
  travel_month?: number;
  arrival_time?: string;
  departure_time?: string;
  daily_start_time?: string;
  daily_end_time?: string;
  time_strictness?: "flexible" | "balanced" | "strict";
};

export type SlotPlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  area?: string;
  lat?: number;
  lng?: number;
  cover_image?: string;
  images?: string[];
  base_price: number;
  duration_min: number;
  hours?: string;
  best_time_of_day?: string;
  is_must_visit: boolean;
  is_full_day: boolean;
  is_free: boolean;
  tags?: string[];
};

export type TimeSlot = {
  start: string;        // HH:MM
  end: string;          // HH:MM
  slot_type: string;
  is_buffer: boolean;
  combo_covered?: boolean;
  notes?: string;
  place?: SlotPlace;
};

export type DayPlan = {
  day_num: number;
  date_str: string;     // YYYY-MM-DD
  day_type: string;
  primary_area: string;
  travel_min: number;
  buffer_min: number;
  slots: TimeSlot[];
};

export type BudgetRecap = {
  total_budget_vnd: number;
  attraction_spent_vnd: number;
  food_spent_vnd: number;
  remaining_vnd: number;
  within_budget: boolean;
};

export type Violation = {
  rule: string;
  severity: "error" | "warning";
  message: string;
  day?: number;
};

export type BudgetTier = "survival" | "budget" | "standard" | "premium";

export type GenerateResponse = {
  days: DayPlan[];
  budget_recap: BudgetRecap;
  combo_result?: {
    use_combo: boolean;
    name?: string;
    savings_vnd?: number;
    savings_pct?: number;
  };
  violations?: Violation[];
  budget_tier: BudgetTier;
  budget_warning?: string;
  slot_template: "relaxed" | "standard" | "active";
  price_stale_warnings?: string[];
};

// ---------------------------------------------------------------------------
// Planner-AI Chat
// ---------------------------------------------------------------------------

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  tool_calls?: string[];
  plan?: GenerateResponse | null;
  created_at: string;
};

export type ChatResponse = {
  session_id: string;
  response: string;
  plan?: GenerateResponse | null;
  tool_calls: string[];
  duration_ms: number;
};

export type SessionInfo = {
  session_id: string;
  created_at?: string;
  last_active?: string;
  message_count: number;
  destination?: string;
  title?: string;
};

export type SessionHistory = {
  session_id: string;
  messages: ChatMessage[];
  message_count: number;
  meta?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Planner-AI request (POST /plan)
// ---------------------------------------------------------------------------

export type PlanRequest = {
  destination: string;
  num_days?: number;
  start_date?: string;
  end_date?: string;
  budget_vnd?: number;
  guest_count?: number;
  preferences?: string[];
  preference_tags?: string[];
  required_places?: string[];
  travel_style?: "relaxed" | "balanced" | "standard" | "active";
  arrival_time?: string;
  departure_time?: string;
  daily_start_time?: string;
  daily_end_time?: string;
  time_strictness?: "flexible" | "balanced" | "strict";
  raw_input?: string;
};

export type PlanResponse = {
  session_id: string;
  destination: string;
  budget_tier: BudgetTier;
  final_plan: GenerateResponse;
  budget_breakdown: Record<string, number>;
  warnings: string[];
  violations: Violation[];
  validation_passed: boolean;
  duration_ms: number;
  cache_hit: boolean;
};

// ---------------------------------------------------------------------------
// API paginated list
// ---------------------------------------------------------------------------

export type PaginatedList<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
};

// ---------------------------------------------------------------------------
// WebSocket events (itinerary realtime)
// ---------------------------------------------------------------------------

export type WSEventType =
  | "activity.created"
  | "activity.updated"
  | "activity.deleted"
  | "activity.reordered"
  | "itinerary.updated"
  | "presence.join"
  | "presence.leave"
  | "presence.online"
  | "collaborator.invited"
  | "collaborator.accepted"
  | "cursor"
  | "error";

export type WSEvent =
  | { type: "activity.created";   payload: { activity: Activity };               sender?: { user_id: string; full_name: string } }
  | { type: "activity.updated";   payload: { activity: Activity };               sender?: { user_id: string; full_name: string } }
  | { type: "activity.deleted";   payload: { activity_id: string };              sender?: { user_id: string; full_name: string } }
  | { type: "activity.reordered"; payload: { items: ReorderItem[] };             sender?: { user_id: string; full_name: string } }
  | { type: "itinerary.updated";  payload: { itinerary: Itinerary };             sender?: { user_id: string; full_name: string } }
  | { type: "presence.join";      payload: { user_id: string; full_name?: string } }
  | { type: "presence.leave";     payload: { user_id: string } }
  // Initial roster sent right after the connection is upgraded.
  | { type: "presence.online";    payload: Array<{ user_id: string; full_name: string }> }
  // Per-user notification — backend sends through the user channel when a new
  // collaborator row is created (or when a pending-by-email row is linked).
  // The invite shape mirrors backend models.Collaborator but loose-typed here
  // so we don't have to track every backend field change in the FE.
  | { type: "collaborator.invited";  payload: { invite: WSCollaborator; inviter_name?: string; itinerary_id: string; itinerary_name?: string } }
  | { type: "collaborator.accepted"; payload: { invite: WSCollaborator; itinerary_id: string } }
  | { type: "cursor";             payload: { user_id: string; activity_id: string; field?: string } }
  | { type: "error";              payload: { message: string } };

// Loose-typed mirror of backend models.Collaborator — only fields the FE
// actually surfaces in toasts / badges.
export type WSCollaborator = {
  id: string;
  itinerary_id: string;
  user_id?: string;
  email?: string;
  role: "EDITOR" | "VIEWER";
  status: "PENDING" | "ACCEPTED";
};
