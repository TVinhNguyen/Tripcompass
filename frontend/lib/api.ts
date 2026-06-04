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
  /**
   * Whether the request is expected to be authenticated. Default true.
   * When false (login/register/logout, public reads), a 401 response will
   * be surfaced as ApiError instead of triggering the login-redirect path.
   * The HttpOnly session cookie is sent on every backend call regardless.
   */
  auth?: boolean;
  /**
   * Skip JSON parsing and return raw Response.
   * Use this for SSE streams: `const res = await apiFetch<Response>("/chat/stream", { raw: true, ... })`
   */
  raw?: boolean;
  /**
   * Suppress the automatic redirect to /auth/login on a 401. Use this when
   * a 401 is a normal expected outcome — e.g. the global useAuth bootstrap
   * probing /auth/me on a page that may be viewed anonymously.
   */
  silent401?: boolean;
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
    silent401 = false,
    headers,
    ...rest
  } = opts;

  const h = new Headers(headers as HeadersInit | undefined);

  // Content-Type
  if (body && !(body instanceof FormData)) {
    h.set("Content-Type", "application/json");
  }

  // Always send the HttpOnly session cookie on backend calls. `auth` is a
  // policy flag (controls 401 redirect behaviour), not a transport flag.
  // Login/social/logout need the cookie round-trip in dev where frontend and
  // backend live on different origins; register intentionally creates no cookie.
  const useCredentials = base === "backend";

  const res = await fetch(buildUrl(base, path, query), {
    ...rest,
    headers: h,
    credentials: useCredentials ? "include" : rest.credentials,
    body:
      body instanceof FormData
        ? body
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
  });

  // Return raw Response for SSE consumers
  if (raw) return res as unknown as T;

  // 401 → redirect to login, but only for requests that expected to be
  // authenticated AND opted in to the redirect. Public reads and the global
  // /auth/me probe pass silent401 / auth:false so anonymous visitors aren't
  // bounced out of public pages.
  if (res.status === 401 && auth && !silent401) {
    if (typeof window !== "undefined") {
      const here = window.location.pathname + window.location.search;
      if (!here.startsWith("/auth/login")) {
        window.location.href = `/auth/login?redirect=${encodeURIComponent(here)}`;
      }
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
  base: ReqOpts["base"] = "backend",
): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  if (extra) for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return apiFetch<T>(path, { method: "POST", body: form, base });
}
