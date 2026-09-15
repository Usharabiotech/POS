import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Lock, X } from "lucide-react";
import clsx from "clsx";
import { api, getUser } from "../api";

type KStatus = "PENDING" | "PREPARING" | "READY" | "COMPLETED";
interface KItem {
  id: string;
  name: string;
  qty: number;
  modifiers: string[];
  note?: string | null;
  kdsStatus: KStatus;
}
interface Ticket {
  orderId: string;
  number: number;
  source: string;
  createdAt: string;
  items: KItem[];
}

const NEXT: Record<KStatus, KStatus | null> = {
  PENDING: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED",
  COMPLETED: null,
};
const LABEL: Record<KStatus, string> = {
  PENDING: "Start",
  PREPARING: "Mark ready",
  READY: "Complete",
  COMPLETED: "Done",
};
const DOT: Record<KStatus, string> = {
  PENDING: "bg-slate-400",
  PREPARING: "bg-amber-500",
  READY: "bg-brand-500",
  COMPLETED: "bg-slate-300",
};

function since(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return mins <= 0 ? "just now" : `${mins} min`;
}

// Colour-code where the ticket came from so packers spot delivery orders instantly.
const SOURCE_STYLE: Record<string, string> = {
  SWIGGY: "bg-[#fc8019] text-white",
  ZOMATO: "bg-[#e23744] text-white",
  KIOSK: "bg-indigo-500 text-white",
  POS: "bg-white/10 text-white/60",
  QR: "bg-teal-500 text-white",
};

export default function KDS() {
  const qc = useQueryClient();
  const isAdmin = getUser()?.role === "ADMIN";
  const { data } = useQuery({
    queryKey: ["kds"],
    queryFn: async () => (await api.get("/kds/tickets")).data as { tickets: Ticket[] },
    refetchInterval: 3000, // cheap realtime: poll, no WebSocket server needed
  });
  const tickets = data?.tickets ?? [];

  const [clearing, setClearing] = useState<{ orderId: string; number: number } | null>(null);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  async function confirmClear() {
    if (!clearing) return;
    setPwBusy(true);
    setPwErr(false);
    try {
      await api.post(`/kds/clear/${clearing.orderId}`, { password: pw });
      toast.success(`Ticket #${clearing.number} cleared`);
      setClearing(null);
      setPw("");
      qc.invalidateQueries({ queryKey: ["kds"] });
    } catch (e: any) {
      if (e?.response?.status === 403) setPwErr(true);
      else toast.error(e?.response?.data?.error ?? "Could not clear");
    } finally {
      setPwBusy(false);
    }
  }

  async function advance(item: KItem) {
    const next = NEXT[item.kdsStatus];
    if (!next) return;
    await api.patch(`/kds/items/${item.id}`, { status: next });
    qc.invalidateQueries({ queryKey: ["kds"] });
  }

  // Demo the delivery pipeline without live Swiggy/Zomato credentials.
  async function simulate(platform: "SWIGGY" | "ZOMATO") {
    try {
      await api.post("/channels/simulate", { platform });
      toast.success(`Test ${platform} order sent`);
      qc.invalidateQueries({ queryKey: ["kds"] });
    } catch {
      toast.error("Could not create test order");
    }
  }

  return (
    <div className="min-h-full bg-slate-900 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="rounded-lg bg-white/10 p-2">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold">Kitchen Display</h1>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-white/40 sm:inline">Test:</span>
              <button
                onClick={() => simulate("SWIGGY")}
                className="rounded-lg bg-[#fc8019] px-3 py-1.5 text-xs font-bold text-white"
              >
                🛵 Swiggy
              </button>
              <button
                onClick={() => simulate("ZOMATO")}
                className="rounded-lg bg-[#e23744] px-3 py-1.5 text-xs font-bold text-white"
              >
                🍽️ Zomato
              </button>
            </div>
          )}
          <span className="text-sm text-white/60">{tickets.length} active · updates every 3s</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tickets.length === 0 && (
          <p className="col-span-full mt-20 text-center text-white/40">No pending tickets 🎉</p>
        )}
        {tickets.map((t) => (
          <div key={t.orderId} className="flex flex-col rounded-2xl bg-white/5 ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="text-lg font-bold">#{t.number}</span>
              <span className="flex items-center gap-2">
                <span
                  className={clsx(
                    "rounded-md px-2 py-0.5 text-[11px] font-bold",
                    SOURCE_STYLE[t.source] ?? "bg-white/10 text-white/60"
                  )}
                >
                  {t.source}
                </span>
                <span className="text-xs text-white/50">{since(t.createdAt)}</span>
              </span>
            </div>
            <div className="flex-1 space-y-1 p-3">
              {t.items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => advance(it)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/10"
                >
                  <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", DOT[it.kdsStatus])} />
                  <span className="w-7 text-center text-lg font-bold">{it.qty}×</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{it.name}</span>
                    {it.modifiers.length > 0 && (
                      <span className="block truncate text-xs text-amber-300">
                        {it.modifiers.join(", ")}
                      </span>
                    )}
                  </span>
                  <span
                    className={clsx(
                      "rounded-lg px-2.5 py-1 text-xs font-bold",
                      it.kdsStatus === "READY" ? "bg-brand-500 text-white" : "bg-white/10 text-white/80"
                    )}
                  >
                    {LABEL[it.kdsStatus]}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setClearing({ orderId: t.orderId, number: t.number }); setPw(""); setPwErr(false); }}
              className="m-3 mt-0 flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-sm font-bold text-white/80 hover:bg-white/20"
            >
              <Lock className="h-4 w-4" /> Clear ticket
            </button>
          </div>
        ))}
      </div>

      {clearing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 text-slate-900">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-lg font-bold">Clear ticket #{clearing.number}</h3>
              <button onClick={() => setClearing(null)} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-sm text-slate-500">Enter the admin password to clear this ticket.</p>
            <input
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => { setPw(e.target.value); setPwErr(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") confirmClear(); }}
              placeholder="Admin password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center outline-none focus:border-brand-500"
            />
            {pwErr && <p className="mt-2 text-sm font-semibold text-red-500">Wrong admin password</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setClearing(null)} className="btn-ghost py-2.5 ring-1 ring-slate-200">Cancel</button>
              <button onClick={confirmClear} disabled={pwBusy || !pw} className="btn-primary py-2.5">
                {pwBusy ? "Clearing…" : "Clear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
