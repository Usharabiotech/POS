import { useMemo, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import type { Product, ModGroup } from "../api";

const money = (n: number) => "₹" + n.toFixed(2);

export interface ConfiguredItem {
  optionIds: string[];
  labels: string[];
  unitPrice: number;
}

/**
 * Option picker for a product with modifier groups (Size, Add-ons, choices).
 * Single-select groups are radios, multi-select are checkboxes; required groups
 * must be satisfied before "Add". Emits the chosen option ids + labels + unit price.
 */
export function ProductConfig({
  product,
  big = false,
  onClose,
  onAdd,
}: {
  product: Product;
  big?: boolean; // larger touch targets for the kiosk
  onClose: () => void;
  onAdd: (sel: ConfiguredItem) => void;
}) {
  const groups = product.modifierGroups ?? [];
  // Preselect the first option of any required single-select group.
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      if (g.selectType === "SINGLE" && g.required && g.options[0]) init[g.id] = [g.options[0].id];
      else init[g.id] = [];
    }
    return init;
  });

  function toggle(g: ModGroup, optionId: string) {
    setSel((cur) => {
      const chosen = cur[g.id] ?? [];
      if (g.selectType === "SINGLE") return { ...cur, [g.id]: [optionId] };
      const has = chosen.includes(optionId);
      if (has) return { ...cur, [g.id]: chosen.filter((id) => id !== optionId) };
      if (g.maxSelect != null && chosen.length >= g.maxSelect) return cur; // at max
      return { ...cur, [g.id]: [...chosen, optionId] };
    });
  }

  const { optionIds, labels, unitPrice, ok } = useMemo(() => {
    const ids: string[] = [];
    const lbls: string[] = [];
    let delta = 0;
    let valid = true;
    for (const g of groups) {
      const chosen = sel[g.id] ?? [];
      if (g.required && chosen.length < 1) valid = false;
      for (const oid of chosen) {
        const o = g.options.find((x) => x.id === oid);
        if (o) { ids.push(o.id); lbls.push(o.name); delta += o.priceDelta; }
      }
    }
    return { optionIds: ids, labels: lbls, unitPrice: product.price + delta, ok: valid };
  }, [sel, groups, product.price]);

  const pad = big ? "p-4 text-lg" : "p-3";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl bg-white sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className={big ? "text-3xl" : "text-2xl"}>{product.emoji}</span>
            <h3 className={clsx("font-bold", big ? "text-2xl" : "text-lg")}>{product.name}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-6 w-6" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {groups.map((g) => (
            <div key={g.id} className="mb-4">
              <div className="mb-2 flex items-baseline gap-2">
                <span className={clsx("font-bold", big ? "text-lg" : "text-sm")}>{g.name}</span>
                <span className="text-xs text-slate-400">
                  {g.required ? "required" : "optional"}
                  {g.selectType === "MULTI" && g.maxSelect ? ` · up to ${g.maxSelect}` : ""}
                </span>
              </div>
              <div className="grid gap-2">
                {g.options.map((o) => {
                  const chosen = (sel[g.id] ?? []).includes(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggle(g, o.id)}
                      className={clsx(
                        "flex items-center justify-between rounded-xl ring-1 transition",
                        pad,
                        chosen ? "bg-brand-50 ring-brand-500" : "bg-white ring-slate-200"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={clsx(
                            "flex h-5 w-5 items-center justify-center border-2",
                            g.selectType === "SINGLE" ? "rounded-full" : "rounded",
                            chosen ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                          )}
                        >
                          {chosen && <span className="text-xs">✓</span>}
                        </span>
                        <span className="font-medium text-slate-800">{o.name}</span>
                      </span>
                      {o.priceDelta > 0 && <span className="text-slate-500">+{money(o.priceDelta)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 p-4">
          <button
            disabled={!ok}
            onClick={() => onAdd({ optionIds, labels, unitPrice })}
            className="btn-primary w-full py-3 text-lg"
          >
            Add · {money(unitPrice)}
          </button>
        </div>
      </div>
    </div>
  );
}
