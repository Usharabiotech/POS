// Pure money math — no DB, no framework — so it can be unit-tested directly and
// stays the single source of truth for order totals across createOrder and quoteOrder.

/** Round to 2 decimals (paise). Currency amounts are always passed through this. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Order-level totals from a cart subtotal.
 * - discount is clamped to [0, subtotal] (a discount can't exceed the bill or go negative).
 * - tax is applied on the discounted (taxable) amount — exclusive/added-on-top model.
 */
export function computeTotals(subtotal: number, discountInput: number, taxRate: number) {
  const discount = Math.min(Math.max(discountInput ?? 0, 0), subtotal);
  const taxable = subtotal - discount;
  const tax = roundMoney(taxable * taxRate);
  const total = roundMoney(taxable + tax);
  return { discount, taxable, tax, total, amountPaise: Math.round(total * 100) };
}

/** Cash change due. Negative means the tender is short of the total. */
export function changeFor(total: number, tendered: number): number {
  return roundMoney(tendered - total);
}
