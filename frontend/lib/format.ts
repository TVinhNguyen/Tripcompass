// =============================================================================
// TripCompass — Shared format helpers
// Source of truth: docs/frontend-review-2026-05-01.md §FE-32, FE-33
// =============================================================================

/**
 * Format a number as Vietnamese Dong currency.
 * Example: 1_500_000 → "1.500.000 ₫"
 */
export function formatVND(amount: number): string {
  return `${amount.toLocaleString("vi-VN")} ₫`;
}

/**
 * Format a date string or Date object to Vietnamese locale.
 * Example: "2026-05-01" → "1 tháng 5, 2026"
 */
export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("vi-VN", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Format a date string to short form.
 * Example: "2026-05-01" → "01/05/2026"
 */
export function formatDateShort(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("vi-VN");
}
