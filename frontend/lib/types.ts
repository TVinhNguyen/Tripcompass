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
  role?: "user" | "admin";
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
  open_time?: string;
  close_time?: string;
  hours?: string;
  recommended_duration?: number; // minutes
  base_price?: number;           // VND
  phone?: string;
  website?: string;
  created_at?: string;
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
// Combo
// ---------------------------------------------------------------------------

export type Combo = {
  id: string;
  title: string;
  destination: string;
  description?: string;
  cover_image?: string;
  num_days: number;
  total_cost: number;       // VND sale price
  original_cost?: number;   // VND original price (before discount)
  savings_pct?: number;
  num_places: number;
  tags: string[];
  places?: Place[];
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  clone_count?: number;     // how many itineraries created from this combo
  created_at?: string;
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
  travel_style?: "relaxed" | "standard" | "active";
  travel_month?: number;
  arrival_time?: string;
  departure_time?: string;
};

export type SlotPlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  area?: string;
  lat: number;
  lng: number;
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
  | { type: "cursor";             payload: { user_id: string; activity_id: string; field?: string } }
  | { type: "error";              payload: { message: string } };
