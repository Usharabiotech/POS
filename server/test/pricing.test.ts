import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, changeFor, roundMoney } from "../src/services/pricing.js";

test("roundMoney kills floating-point dust", () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(94.5), 94.5);
  assert.equal(roundMoney(4.9995), 5);
});

test("computeTotals: 5% tax added on top", () => {
  const t = computeTotals(100, 0, 0.05);
  assert.deepEqual(t, { discount: 0, taxable: 100, tax: 5, total: 105, amountPaise: 10500 });
});

test("computeTotals: matches the ₹90 juice and ₹140 smoothie live cases", () => {
  assert.equal(computeTotals(90, 0, 0.05).total, 94.5);
  assert.equal(computeTotals(140, 0, 0.05).total, 147);
});

test("computeTotals: 18% GST", () => {
  assert.equal(computeTotals(100, 0, 0.18).total, 118);
});

test("computeTotals: tax off (0%)", () => {
  const t = computeTotals(250, 0, 0);
  assert.equal(t.tax, 0);
  assert.equal(t.total, 250);
});

test("computeTotals: discount reduces the taxable base", () => {
  const t = computeTotals(100, 20, 0.05);
  assert.equal(t.discount, 20);
  assert.equal(t.taxable, 80);
  assert.equal(t.tax, 4);
  assert.equal(t.total, 84);
});

test("computeTotals: discount is clamped to the subtotal (never negative total)", () => {
  const t = computeTotals(100, 150, 0.05);
  assert.equal(t.discount, 100);
  assert.equal(t.total, 0);
});

test("computeTotals: a negative discount can't inflate the bill", () => {
  const t = computeTotals(100, -50, 0.05);
  assert.equal(t.discount, 0);
  assert.equal(t.total, 105);
});

test("computeTotals: fractional prices round to paise consistently", () => {
  const t = computeTotals(99.99, 0, 0.05); // 99.99 * 0.05 = 4.9995 -> 5.00
  assert.equal(t.tax, 5);
  assert.equal(t.total, 104.99);
  assert.equal(t.amountPaise, 10499);
});

test("changeFor: correct change and short-tender detection", () => {
  assert.equal(changeFor(147, 200), 53);
  assert.equal(changeFor(99.99, 100), 0.01);
  assert.equal(changeFor(105, 100), -5); // negative => tender is short
});
