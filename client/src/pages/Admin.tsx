import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, Minus, Pencil, X } from "lucide-react";
import clsx from "clsx";
import { api, getUser } from "../api";

const money = (n: number) => "₹" + n.toFixed(2);

interface AdminProduct {
  id: string;
  name: string;
  categoryId: string;
  kind: "READYMADE" | "PREPARED";
  price: number;
  stock: number | null;
  emoji: string;
  color: string;
  active: boolean;
  lowStockAt: number;
  cost: number | null;
  category: { name: string; emoji: string };
}
interface Cat {
  id: string;
  name: string;
  emoji: string;
}
interface Staff {
  id: string;
  username: string;
  name: string;
  role: "ADMIN" | "CASHIER";
  active: boolean;
}

export default function Admin() {
  const user = getUser();
  const [tab, setTab] = useState<"products" | "inventory" | "staff">("products");

  if (user?.role !== "ADMIN") {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Admin access only.</p>
        <Link to="/" className="btn-primary mt-4 inline-flex">Back to POS</Link>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link to="/" className="btn-ghost"><ArrowLeft className="h-5 w-5" /></Link>
        <h1 className="text-xl font-bold">Manage store</h1>
        <div className="ml-4 flex gap-2">
          {(["products", "inventory", "staff"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "rounded-full px-4 py-1.5 text-sm font-semibold capitalize",
                tab === t ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </header>
      <div className="mx-auto max-w-5xl p-4">
        {tab === "products" ? <Products /> : tab === "inventory" ? <Inventory /> : <StaffTab />}
      </div>
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────────────
function Products() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);

  const { data } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => (await api.get("/admin/products")).data as { products: AdminProduct[] },
  });
  const { data: catData } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => (await api.get("/admin/categories")).data as { categories: Cat[] },
  });
  const cats = catData?.categories ?? [];

  const restock = useMutation({
    mutationFn: async (v: { id: string; delta: number }) =>
      api.post(`/products/${v.id}/stock`, { delta: v.delta }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products"] }),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });
  const toggle = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) =>
      api.patch(`/products/${v.id}`, { active: v.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products"] }),
  });

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">{data?.products.length ?? 0} products</p>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add product
        </button>
      </div>

      <div className="card divide-y divide-slate-100">
        {(data?.products ?? []).map((p) => (
          <div key={p.id} className={clsx("flex items-center gap-3 px-3 py-2.5", !p.active && "opacity-50")}>
            <span className="text-2xl">{p.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="text-xs text-slate-500">
                {p.category.name} · {p.kind === "PREPARED" ? "Made-to-order" : "Ready-made"}
              </p>
            </div>
            <span className="w-20 text-right font-bold">{money(p.price)}</span>
            <div className="flex w-32 items-center justify-end gap-1">
              {p.stock === null ? (
                <span className="text-xs text-slate-400">no stock</span>
              ) : (
                <>
                  <button onClick={() => restock.mutate({ id: p.id, delta: -1 })} className="rounded bg-slate-100 p-1">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className={clsx("w-10 text-center font-semibold", p.stock <= p.lowStockAt && "text-red-500")}>
                    {p.stock}
                  </span>
                  <button onClick={() => restock.mutate({ id: p.id, delta: 1 })} className="rounded bg-slate-100 p-1">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <button
              onClick={() => toggle.mutate({ id: p.id, active: !p.active })}
              className={clsx(
                "w-16 rounded-full px-2 py-1 text-xs font-semibold",
                p.active ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-500"
              )}
            >
              {p.active ? "Active" : "Hidden"}
            </button>
            <button onClick={() => setEditing(p)} className="text-slate-400 hover:text-brand-600">
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <ProductModal
          product={editing === "new" ? null : editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin-products"] });
          }}
        />
      )}
    </>
  );
}

function ProductModal({
  product,
  cats,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  cats: Cat[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? cats[0]?.id ?? "");
  const [kind, setKind] = useState<"READYMADE" | "PREPARED">(product?.kind ?? "READYMADE");
  const [price, setPrice] = useState(product?.price ?? 0);
  const [cost, setCost] = useState<number>(product?.cost ?? 0);
  const [emoji, setEmoji] = useState(product?.emoji ?? "🍓");
  const [tracksStock, setTracksStock] = useState(product ? product.stock !== null : true);
  const [stock, setStock] = useState(product?.stock ?? 0);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name || !categoryId) {
      toast.error("Name and category required");
      return;
    }
    setBusy(true);
    const body = {
      name,
      categoryId,
      kind,
      price: Number(price),
      cost: cost ? Number(cost) : null,
      emoji,
      stock: tracksStock ? Number(stock) : null,
    };
    try {
      if (product) await api.patch(`/products/${product.id}`, body);
      else await api.post("/products", body);
      toast.success(product ? "Product updated" : "Product added");
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold">{product ? "Edit product" : "New product"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-6 w-6" /></button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-3">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-16 rounded-xl border border-slate-300 px-3 py-2 text-center text-2xl"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product name"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2"
          >
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Price ₹</label>
              <input
                type="number"
                value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Type</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              >
                <option value="READYMADE">Ready-made</option>
                <option value="PREPARED">Made-to-order</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Cost price ₹ (for stock value & profit — optional)</label>
            <input
              type="number"
              value={cost || ""}
              onChange={(e) => setCost(Number(e.target.value))}
              placeholder="0"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tracksStock} onChange={(e) => setTracksStock(e.target.checked)} />
            Track stock
          </label>
          {tracksStock && (
            <input
              type="number"
              value={stock || ""}
              onChange={(e) => setStock(Number(e.target.value))}
              placeholder="Current stock"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          )}
          <button className="btn-primary w-full py-2.5" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inventory ───────────────────────────────────────────────────────────────
interface InvItem {
  id: string;
  name: string;
  category: string;
  tracked: boolean;
  stock: number | null;
  low: boolean;
  price: number;
  cost: number | null;
  stockValueRetail: number;
  stockValueCost: number;
  soldQty: number;
  soldValue: number;
}
interface InvReport {
  windowDays: number;
  since: string;
  totals: {
    trackedProducts: number;
    lowCount: number;
    outCount: number;
    stockUnits: number;
    stockValueRetail: number;
    stockValueCost: number;
    soldUnits: number;
    soldValue: number;
  };
  items: InvItem[];
}

function Inventory() {
  const qc = useQueryClient();
  const [days, setDays] = useState(1);
  const [adjust, setAdjust] = useState<InvItem | null>(null);
  const { data } = useQuery({
    queryKey: ["inventory", days],
    queryFn: async () => (await api.get("/inventory/report", { params: { days } })).data as InvReport,
    refetchInterval: 15000,
  });
  const t = data?.totals;
  const tracked = (data?.items ?? []).filter((i) => i.tracked);

  const RANGES = [
    { d: 1, label: "Today" },
    { d: 7, label: "7 days" },
    { d: 30, label: "30 days" },
  ];

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">Stock levels, value & sales — {t?.trackedProducts ?? 0} tracked items</p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.d}
              onClick={() => setDays(r.d)}
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-semibold",
                days === r.d ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Stock value (cost)" value={money(t?.stockValueCost ?? 0)} sub="what stock is worth" />
        <Kpi label="Stock value (retail)" value={money(t?.stockValueRetail ?? 0)} sub={`${t?.stockUnits ?? 0} units on hand`} />
        <Kpi label="Sold in period" value={money(t?.soldValue ?? 0)} sub={`${t?.soldUnits ?? 0} units sold`} />
        <Kpi label="Low / Out" value={`${t?.lowCount ?? 0} / ${t?.outCount ?? 0}`} sub="need restock" warn={(t?.lowCount ?? 0) > 0} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">In stock</th>
              <th className="px-3 py-2 text-right">Sold ({data?.windowDays ?? 1}d)</th>
              <th className="px-3 py-2 text-right">Stock value</th>
              <th className="px-3 py-2 text-right">Sales</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tracked.map((i) => (
              <tr key={i.id} className="border-b border-slate-100">
                <td className="px-3 py-2">
                  <span className="font-semibold">{i.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{i.category}</span>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  <span className={clsx(i.stock === 0 ? "text-red-500" : i.low ? "text-amber-600" : "")}>
                    {i.stock}
                  </span>
                  {i.low && i.stock !== 0 && <span className="ml-1 text-xs text-amber-600">low</span>}
                  {i.stock === 0 && <span className="ml-1 text-xs text-red-500">out</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{i.soldQty}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(i.stockValueCost || i.stockValueRetail)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(i.soldValue)}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setAdjust(i)} className="rounded-lg bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
                    + Stock
                  </button>
                </td>
              </tr>
            ))}
            {tracked.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No stock-tracked items.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adjust && (
        <StockAdjustModal
          item={adjust}
          onClose={() => setAdjust(null)}
          onSaved={() => {
            setAdjust(null);
            qc.invalidateQueries({ queryKey: ["inventory"] });
            qc.invalidateQueries({ queryKey: ["admin-products"] });
          }}
        />
      )}
      <p className="mt-2 text-xs text-slate-400">
        Stock is deducted automatically when an order is paid, so "sold" and "in stock" always reconcile with POS sales.
      </p>
    </>
  );
}

function StockAdjustModal({
  item,
  onClose,
  onSaved,
}: {
  item: InvItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [receive, setReceive] = useState<number>(0);
  const [setTo, setSetTo] = useState<string>("");
  const [cost, setCost] = useState<number>(item.cost ?? 0);
  const [busy, setBusy] = useState(false);

  const projected = setTo !== "" ? Number(setTo) : (item.stock ?? 0) + (receive || 0);

  async function save() {
    setBusy(true);
    try {
      // Set cost if changed.
      if (Number(cost) !== (item.cost ?? 0)) {
        await api.patch(`/products/${item.id}`, { cost: cost ? Number(cost) : null });
      }
      // Set absolute stock, or add received quantity.
      if (setTo !== "") {
        await api.patch(`/products/${item.id}`, { stock: Math.max(0, Number(setTo)) });
      } else if (receive) {
        await api.post(`/products/${item.id}/stock`, { delta: Number(receive) });
      }
      toast.success(`${item.name} updated`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not update stock");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-bold">Adjust stock</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">{item.name} · in stock <b>{item.stock}</b></p>

        <label className="mb-1 block text-xs font-semibold text-slate-500">Receive / add quantity</label>
        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => setReceive((r) => Math.max(0, r - 1))} className="rounded-lg bg-slate-100 p-2"><Minus className="h-4 w-4" /></button>
          <input
            type="number"
            value={receive || ""}
            onChange={(e) => { setReceive(Number(e.target.value)); setSetTo(""); }}
            placeholder="0"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center"
          />
          <button onClick={() => setReceive((r) => r + 1)} className="rounded-lg bg-slate-100 p-2"><Plus className="h-4 w-4" /></button>
        </div>

        <label className="mb-1 block text-xs font-semibold text-slate-500">…or set exact count (stock take)</label>
        <input
          type="number"
          value={setTo}
          onChange={(e) => { setSetTo(e.target.value); setReceive(0); }}
          placeholder={String(item.stock ?? 0)}
          className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2"
        />

        <label className="mb-1 block text-xs font-semibold text-slate-500">Cost price ₹ (for value & profit)</label>
        <input
          type="number"
          value={cost || ""}
          onChange={(e) => setCost(Number(e.target.value))}
          placeholder="0"
          className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-2"
        />

        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-center text-sm">
          New stock level: <b className="text-brand-700">{projected}</b>
        </div>
        <button className="btn-primary w-full py-2.5" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className={clsx("card p-3", warn && "ring-2 ring-amber-200")}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}

// ── Staff ─────────────────────────────────────────────────────────────────
function StaffTab() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "CASHIER" });

  const { data } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get("/admin/users")).data as { users: Staff[] },
  });
  const toggle = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) =>
      api.patch(`/admin/users/${v.id}`, { active: v.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  async function add() {
    try {
      await api.post("/admin/users", form);
      toast.success("Staff added");
      setAdding(false);
      setForm({ username: "", name: "", password: "", role: "CASHIER" });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Failed");
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">{data?.users.length ?? 0} staff</p>
        <button className="btn-primary" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> Add staff
        </button>
      </div>

      {adding && (
        <div className="card mb-3 grid gap-2 p-4 sm:grid-cols-4">
          <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
          <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
          <div className="flex gap-2">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="flex-1 rounded-xl border border-slate-300 px-2 py-2">
              <option value="CASHIER">Cashier</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button className="btn-primary" onClick={add}>Save</button>
          </div>
        </div>
      )}

      <div className="card divide-y divide-slate-100">
        {(data?.users ?? []).map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex-1">
              <p className="font-semibold">{u.name}</p>
              <p className="text-xs text-slate-500">@{u.username} · {u.role}</p>
            </div>
            <button
              onClick={() => toggle.mutate({ id: u.id, active: !u.active })}
              className={clsx(
                "w-20 rounded-full px-2 py-1 text-xs font-semibold",
                u.active ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-500"
              )}
            >
              {u.active ? "Active" : "Disabled"}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
