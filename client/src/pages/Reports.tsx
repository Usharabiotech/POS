import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Receipt, TrendingUp, Percent, ShoppingBag, DownloadCloud } from "lucide-react";
import { api, getUser } from "../api";

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
  const { data } = useQuery({
    queryKey: ["summary"],
    queryFn: async () => (await api.get("/reports/summary")).data as Summary,
    refetchInterval: 15000,
  });

  const maxHour = Math.max(1, ...(data?.hourly ?? [1]));
  const isAdmin = getUser()?.role === "ADMIN";
  const [closing, setClosing] = useState(false);

  async function closeDay() {
    if (!confirm("Close the day? This downloads today's EOD report + all invoices to this device, then trims old detail from the cloud.")) return;
    setClosing(true);
    try {
      // Lazy-load the PDF/ZIP libs only when actually closing the day.
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
    <div className="min-h-full">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link to="/" className="btn-ghost">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Today · {data?.date ?? ""}</h1>
        {isAdmin && (
          <button onClick={closeDay} disabled={closing} className="btn-primary ml-auto">
            <DownloadCloud className="h-5 w-5" />
            {closing ? "Preparing…" : "Close day & download"}
          </button>
        )}
      </header>

      <div className="mx-auto max-w-5xl space-y-4 p-4">
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
                <span className="truncate text-slate-700">
                  {i + 1}. {it.name}
                </span>
                <span className="ml-2 shrink-0 font-semibold">
                  {it.qty} · {money(it.revenue)}
                </span>
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
