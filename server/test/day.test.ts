import { test } from "node:test";
import assert from "node:assert/strict";

// Pin the store timezone to IST (330 min) before importing the module under test,
// so the assertions hold regardless of the machine's own timezone or .env.
process.env.TZ_OFFSET_MINUTES = "330";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

const { storeDayBounds, storeDayLabel, storeHour } = await import("../src/lib/day.js");

test("storeDayBounds: an IST day spans 18:30Z the day before to 18:30Z that day", () => {
  const { start, end, label } = storeDayBounds("2026-09-21");
  assert.equal(label, "2026-09-21");
  assert.equal(start.toISOString(), "2026-09-20T18:30:00.000Z");
  assert.equal(end.toISOString(), "2026-09-21T18:30:00.000Z");
});

test("storeDayLabel: 1:30 AM IST files under that IST date, not the UTC one", () => {
  // 2026-09-20T20:00:00Z == 2026-09-21 01:30 IST
  assert.equal(storeDayLabel(new Date("2026-09-20T20:00:00Z")), "2026-09-21");
});

test("storeDayLabel: 11:59 PM IST stays on the same IST date", () => {
  // 2026-09-20T18:29:00Z == 2026-09-20 23:59 IST
  assert.equal(storeDayLabel(new Date("2026-09-20T18:29:00Z")), "2026-09-20");
});

test("storeDayLabel: the day boundary instant belongs to the new day", () => {
  // exactly 2026-09-21 00:00 IST
  assert.equal(storeDayLabel(new Date("2026-09-20T18:30:00Z")), "2026-09-21");
});

test("storeHour: hour is in store-local time", () => {
  assert.equal(storeHour(new Date("2026-09-20T20:00:00Z")), 1); // 01:30 IST -> hour 1
  assert.equal(storeHour(new Date("2026-09-21T04:30:00Z")), 10); // 10:00 IST
});

test("a sale is grouped into exactly one day, on the boundary", () => {
  const at = new Date("2026-09-20T18:30:00Z");
  const { start, end } = storeDayBounds(storeDayLabel(at));
  assert.ok(at >= start && at < end, "instant falls within its own day's [start,end)");
});
