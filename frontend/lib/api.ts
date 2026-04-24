// =============================================================================
// TripCompass — API fetch wrapper
// Source of truth: docs/integration/06-FRONTEND-INFRA.md §1
// =============================================================================

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL!;   // http://localhost:8080/api/v1
const AI_URL      = process.env.NEXT_PUBLIC_PLANNER_AI_URL!; // http://localhost:8001

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Request options
// ---------------------------------------------------------------------------

export type ReqOpts = Omit<RequestInit, "body"> & {
  /** Request body — will be JSON-serialised unless FormData */
  body?: unknown;
  /** Query-string params (undefined / empty-string values are skipped) */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Which base URL to use — default "backend" */
  base?: "backend" | "ai";
  /** Whether to attach Bearer token — default true */
  auth?: boolean;
  /**
   * Skip JSON parsing and return raw Response.
   * Use this for SSE streams: `const res = await apiFetch<Response>("/chat/stream", { raw: true, ... })`
   */
  raw?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUrl(
  base: "backend" | "ai",
  path: string,
  query?: ReqOpts["query"],
): string {
  const root = (base === "ai" ? AI_URL : BACKEND_URL).replace(/\/$/, "");
  const url = new URL(root + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

// ---------------------------------------------------------------------------
// Core fetch
// ---------------------------------------------------------------------------

export async function apiFetch<T = unknown>(
  path: string,
  opts: ReqOpts = {},
): Promise<T> {
  const {
    body,
    query,
    base = "backend",
    auth = true,
    raw = false,
    headers,
    ...rest
  } = opts;

  const h = new Headers(headers as HeadersInit | undefined);

  // Content-Type
  if (body && !(body instanceof FormData)) {
    h.set("Content-Type", "application/json");
  }

  // Auth
  if (auth) {
    const token = getToken();
    if (token) h.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(buildUrl(base, path, query), {
    ...rest,
    headers: h,
    body:
      body instanceof FormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
  });

  // Return raw Response for SSE consumers
  if (raw) return res as unknown as T;

  // 401 — token expired / invalid
  if (res.status === 401 && auth) {
    localStorage.removeItem("token");
    if (typeof window !== "undefined") {
      const here = window.location.pathname + window.location.search;
      window.location.href = `/auth/login?redirect=${encodeURIComponent(here)}`;
    }
    throw new ApiError(401, null, "Phiên đăng nhập đã hết hạn.");
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  // Parse JSON
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data,
      (data as Record<string, string>)?.error ?? `HTTP ${res.status}`,
    );
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Convenience shorthands
// ---------------------------------------------------------------------------

/** Upload a file via multipart/form-data */
export async function apiUpload<T = unknown>(
  path: string,
  file: File,
  fieldName = "file",
  extra?: Record<string, string>,
): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  if (extra) for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return apiFetch<T>(path, { method: "POST", body: form });
}
