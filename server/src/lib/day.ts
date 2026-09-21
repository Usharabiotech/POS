import { env } from "../env.js";

// Business-day math in the store's timezone (env.TZ_OFFSET_MINUTES, IST=330).
// Orders store createdAt in UTC; grouping them by the server process's local day
// misfiles sales when the host runs on UTC (e.g. Railway). These helpers key every
// day boundary and hourly bucket off the store timezone so reports + EOD agree and
// a 1 AM IST sale lands on the right business day.

const offsetMs = () => env.tzOffsetMinutes * 60_000;

/** Store-local YYYY-MM-DD for an instant (default: now). */
export function storeDayLabel(at: Date = new Date()): string {
  const local = new Date(at.getTime() + offsetMs());
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** UTC [start, end) instants spanning one store-local day. dateStr = store-local YYYY-MM-DD; default today. */
export function storeDayBounds(dateStr?: string): { start: Date; end: Date; label: string } {
  const label = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : storeDayLabel();
  const [y, m, d] = label.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d) - offsetMs());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, label };
}

/** Hour 0–23 of an instant in store-local time. */
export function storeHour(at: Date): number {
  return new Date(at.getTime() + offsetMs()).getUTCHours();
}
