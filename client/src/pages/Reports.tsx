import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Receipt, TrendingUp, Percent, ShoppingBag, DownloadCloud, CalendarRange, Clock } from "lucide-react";
import { api, getUser } from "../api";
import { loadSchedule, saveSchedule, getLastRun, type EodSchedule } from "../lib/eodSchedule";

const money = (n: number) => "₹" + n.toFixed(2);

interface Summary {
  date: string;
  orderCount: number;
  sales: number;
  tax: number;
  discount: number;
  avgOrder: number;
  byMethod: Record<string, number>;
  topItems: { name: string; qty: number; revenue: number }[];
  hourly: number[];
}

export default function Reports() {
  const [view, setView] = useState<"today" | "dashboard">("today");
  const [store, setStore] = useState<string>("all"); // "all" = cumulative across branches
  const { data: storesData } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => (await api.get("/stores")).data as { stores: { id: string; name: string }[] },
  });
  const stores = storesData?.stores ?? [];
  const isAdmin = getUser()?.role === "ADMIN";

  return (
    <div className="min-h-full">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link to="/" className="btn-ghost">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setView("today")}
            className={"rounded-lg px-3 py-1.5 text-sm font-semibold " + (view === "today" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500")}
          >
            Today
          </button>
          <button
            onClick={() => setView("dashboard")}
            className={"rounded-lg px-3 py-1.5 text-sm font-semibold " + (view === "dashboard" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500")}
          >
            Sales dashboard
          </button>
        </div>
        {stores.length > 1 && (
          <select
            value={store}
            onChange={(e) => setStore(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="all">All branches (cumulative)</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </header>

      {view === "today" ? (
        <TodayView store={store} isAdmin={isAdmin} />
      ) : (
        <DashboardView store={store} />
      )}
    </div>
  );
}

function TodayView({ store, isAdmin }: { store: string; isAdmin: boolean }) {
  const { data } = useQuery({
    queryKey: ["summary", store],
    queryFn: async () =>
      (await api.get("/reports/summary", { params: store !== "all" ? { storeId: store } : {} })).data as Summary,
    refetchInterval: 15000,
  });
  const maxHour = Math.max(1, ...(data?.hourly ?? [1]));
  const [closing, setClosing] = useState(false);

  async function closeDay() {
    if (!confirm("Close the day? This downloads today's EOD report + all invoices to this device, then trims old detail from the cloud.")) return;
    setClosing(true);
    try {
      const { downloadEOD } = await import("../lib/eod");
      const r = await downloadEOD();
      toast.success(
        `Day closed — downloaded ${r.orderCount} invoice${r.orderCount === 1 ? "" : "s"} + report.` +
          (r.purgedOrders > 0 ? ` Trimmed ${r.purgedOrders} old orders from cloud.` : "")
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not close the day");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Today · {data?.date ?? ""}</h1>
        {isAdmin && (
          <button onClick={closeDay} disabled={closing} className="btn-primary">
            <DownloadCloud className="h-5 w-5" />
            {closing ? "Preparing…" : "Close day & download"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<TrendingUp className="h-5 w-5" />} label="Sales" value={money(data?.sales ?? 0)} />
        <Stat icon={<Receipt className="h-5 w-5" />} label="Orders" value={String(data?.orderCount ?? 0)} />
        <Stat icon={<ShoppingBag className="h-5 w-5" />} label="Avg order" value={money(data?.avgOrder ?? 0)} />
        <Stat icon={<Percent className="h-5 w-5" />} label="Tax collected" value={money(data?.tax ?? 0)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 font-bold">Payment mix</h2>
          {Object.entries(data?.byMethod ?? {}).map(([m, v]) => (
            <div key={m} className="mb-2 flex items-center justify-between">
              <span className="text-slate-600">{m}</span>
              <span className="font-semibold">{money(v)}</span>
            </div>
          ))}
        </div>

        <div className="card p-4">
          <h2 className="mb-3 font-bold">Top sellers</h2>
          {(data?.topItems ?? []).length === 0 && (
            <p className="text-sm text-slate-400">No sales yet today.</p>
          )}
          {(data?.topItems ?? []).map((it, i) => (
            <div key={i} className="mb-2 flex items-center justify-between text-sm">
              <span className="truncate text-slate-700">{i + 1}. {it.name}</span>
              <span className="ml-2 shrink-0 font-semibold">{it.qty} · {money(it.revenue)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-bold">Sales by hour</h2>
        <div className="flex h-32 items-end gap-1">
          {(data?.hourly ?? Array(24).fill(0)).map((v, h) => (
            <div key={h} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-brand-500"
                style={{ height: `${(v / maxHour) * 100}%` }}
                title={`${h}:00 — ${money(v)}`}
              />
              {h % 3 === 0 && <span className="text-[9px] text-slate-400">{h}</span>}
            </div>
          ))}
        </div>
      </div>

      {isAdmin && <ScheduleCard />}
      <Transactions />
    </div>
  );
}

// ── Custom date-range sales dashboard ──────────────────────────────────────
interface RangeReport {
  from: string;
  to: string;
  sales: number;
  tax: number;
  discount: number;
  orderCount: number;
  avgOrder: number;
  byMethod: Record<string, number>;
  topItems: { name: string; qty: number; revenue: number }[];
  daily: { date: string; sales: number; orders: number }[];
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function shiftDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
function monthStart() {
  const d = new Date();
  return fmtDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function DashboardView({ store }: { store: string }) {
  const [from, setFrom] = useState<string>(shiftDays(-6));
  const [to, setTo] = useState<string>(fmtDate(new Date()));

  const { data, isFetching } = useQuery({
    queryKey: ["range", store, from, to],
    queryFn: async () =>
      (await api.get("/reports/range", { params: { from, to, ...(store !== "all" ? { storeId: store } : {}) } }))
        .data as RangeReport,
  });

  const daily = data?.daily ?? [];
  const maxDay = Math.max(1, ...daily.map((d) => d.sales));
  const presets: { label: string; from: string; to: string }[] = [
    { label: "Today", from: fmtDate(new Date()), to: fmtDate(new Date()) },
    { label: "Last 7 days", from: shiftDays(-6), to: fmtDate(new Date()) },
    { label: "Last 30 days", from: shiftDays(-29), to: fmtDate(new Date()) },
    { label: "This month", from: monthStart(), to: fmtDate(new Date()) },
  ];
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.label;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2 font-bold">
          <CalendarRange className="h-5 w-5 text-brand-600" /> Sales dashboard
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">To</span>
            <input type="date" value={to} min={from} max={fmtDate(new Date())} onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => { setFrom(p.from); setTo(p.to); }}
                className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (activePreset === p.label ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<TrendingUp className="h-5 w-5" />} label="Total sales" value={money(data?.sales ?? 0)} />
        <Stat icon={<Receipt className="h-5 w-5" />} label="Orders" value={String(data?.orderCount ?? 0)} />
        <Stat icon={<ShoppingBag className="h-5 w-5" />} label="Avg order" value={money(data?.avgOrder ?? 0)} />
        <Stat icon={<Percent className="h-5 w-5" />} label="Tax collected" value={money(data?.tax ?? 0)} />
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-bold">Daily sales {isFetching && <span className="text-xs font-normal text-slate-400">· updating…</span>}</h2>
        {daily.length === 0 ? (
          <p className="text-sm text-slate-400">No sales in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex h-48 min-w-full items-end gap-1" style={{ minWidth: daily.length * 22 }}>
              {daily.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date} — ${money(d.sales)} · ${d.orders} order${d.orders === 1 ? "" : "s"}`}>
                  <div className="w-full rounded-t bg-brand-500 transition-all" style={{ height: `${(d.sales / maxDay) * 100}%`, minHeight: d.sales > 0 ? 2 : 0 }} />
                  <span className="text-[8px] text-slate-400">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 font-bold">Payment mix</h2>
          {Object.entries(data?.byMethod ?? {}).filter(([, v]) => v > 0).length === 0 && (
            <p className="text-sm text-slate-400">No sales in this range.</p>
          )}
          {Object.entries(data?.byMethod ?? {}).filter(([, v]) => v > 0).map(([m, v]) => (
            <div key={m} className="mb-2 flex items-center justify-between">
              <span className="text-slate-600">{m}</span>
              <span className="font-semibold">{money(v)}</span>
            </div>
          ))}
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-bold">Top sellers</h2>
          {(data?.topItems ?? []).length === 0 && <p className="text-sm text-slate-400">No sales in this range.</p>}
          {(data?.topItems ?? []).map((it, i) => (
            <div key={i} className="mb-2 flex items-center justify-between text-sm">
              <span className="truncate text-slate-700">{i + 1}. {it.name}</span>
              <span className="ml-2 shrink-0 font-semibold">{it.qty} · {money(it.revenue)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Automatic day-close schedule (admin) ───────────────────────────────────
function ScheduleCard() {
  const [sched, setSched] = useState<EodSchedule>(() => loadSchedule());
  const lastRun = getLastRun();

  function update(next: EodSchedule) {
    setSched(next);
    saveSchedule(next);
  }

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2 font-bold">
        <Clock className="h-5 w-5 text-brand-600" /> Automatic day-close
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Run the day-close automatically and save the EOD file to this device — no need to remember.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sched.enabled}
            onChange={(e) => update({ ...sched, enabled: e.target.checked })}
            className="h-5 w-5 accent-brand-600"
          />
          <span className="font-semibold">{sched.enabled ? "On" : "Off"}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Run at</span>
          <input
            type="time"
            value={sched.time}
            onChange={(e) => update({ ...sched, time: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        {lastRun && <span className="text-xs text-slate-400">Last auto-run: {lastRun}</span>}
      </div>
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Runs on <b>this device</b> while the app is open and an admin is signed in. Keep the billing
        computer on and this app open at the scheduled time. The file downloads to this device.
      </p>
    </div>
  );
}

interface TxnOrder {
  id: string;
  number: number;
  source: string;
  total: number;
  tender: string | null;
  paid: boolean;
  createdAt: string;
  customerName: string | null;
  customer: { phone: string } | null;
  items: { id: string; name: string; qty: number }[];
}

const SRC_BADGE: Record<string, string> = {
  POS: "bg-slate-100 text-slate-600",
  KIOSK: "bg-indigo-100 text-indigo-700",
  SWIGGY: "bg-orange-100 text-orange-700",
  ZOMATO: "bg-red-100 text-red-700",
  QR: "bg-teal-100 text-teal-700",
};

function Transactions() {
  const [source, setSource] = useState<string>("KIOSK");
  const { data } = useQuery({
    queryKey: ["transactions", source],
    queryFn: async () =>
      (await api.get("/orders", { params: { limit: 100, ...(source !== "all" ? { source } : {}) } }))
        .data as { orders: TxnOrder[] },
    refetchInterval: 15000,
  });
  const orders = data?.orders ?? [];

  // Simple trend: repeat customers in this list (same phone seen more than once).
  const phoneCounts: Record<string, number> = {};
  for (const o of orders) if (o.customer?.phone) phoneCounts[o.customer.phone] = (phoneCounts[o.customer.phone] ?? 0) + 1;
  const repeats = Object.values(phoneCounts).filter((n) => n > 1).length;

  const TABS = [
    { k: "KIOSK", label: "Kiosk" },
    { k: "POS", label: "Counter" },
    { k: "SWIGGY", label: "Swiggy" },
    { k: "ZOMATO", label: "Zomato" },
    { k: "all", label: "All" },
  ];

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Transactions</h2>
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setSource(t.k)}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold " +
                (source === t.k ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 text-xs text-slate-400">
        {orders.length} shown · {repeats > 0 ? `${repeats} repeat customer${repeats === 1 ? "" : "s"}` : "individual transactions with customer details"}
      </p>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">When</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Customer</th>
              <th className="px-2 py-2">Items</th>
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 align-top">
                <td className="px-2 py-2 font-semibold tabular-nums">{o.number}</td>
                <td className="px-2 py-2 whitespace-nowrap text-xs text-slate-500">
                  {new Date(o.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-2 py-2">
                  <span className={"rounded px-1.5 py-0.5 text-[10px] font-bold " + (SRC_BADGE[o.source] ?? "bg-slate-100 text-slate-600")}>
                    {o.source}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="font-medium">{o.customerName ?? "Walk-in"}</div>
                  {o.customer?.phone && <div className="text-xs text-slate-400">{o.customer.phone}</div>}
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                  {money(o.total)}
                  <div className="text-[10px] text-slate-400">{o.paid ? o.tender ?? "" : "unpaid"}</div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-8 text-center text-slate-400">No transactions.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-center gap-2 text-slate-400">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}
