import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Monitor,
  BarChart3,
  LogOut,
  Settings,
  Tablet,
  Wifi,
  WifiOff,
  Clock,
  X,
} from "lucide-react";
import clsx from "clsx";
import { api, clearSession, getUser, type Category, type Product } from "../api";
import { Receipt, type ReceiptOrder } from "../components/Receipt";
import { enqueue } from "../lib/offline";
import { useOffline } from "../lib/useOffline";
import { unlockAudio } from "../lib/sound";
import { useOnlineOrders, type OnlineOrder } from "../lib/useOnlineOrders";
import { payWithRazorpay, PaymentCancelled } from "../lib/razorpay";

interface CartLine {
  product: Product;
  qty: number;
}
type PayMethod = "CASH" | "UPI" | "CARD";

const money = (n: number) => "₹" + n.toFixed(2);

export default function POS() {
  const nav = useNavigate();
  const user = getUser();
  const { online, queued } = useOffline();
  const { latest: onlineOrder, dismiss: dismissOnline } = useOnlineOrders();
  const [activeCat, setActiveCat] = useState<string>("all");

  // Satisfy browser autoplay policy: unlock the chime on the first interaction.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [custName, setCustName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: async () => (await api.get("/config")).data as { storeName: string; taxRate: number },
  });
  const taxRate = config?.taxRate ?? 0.05;

  const { data: payCfg } = useQuery({
    queryKey: ["paycfg"],
    queryFn: async () => (await api.get("/payments/config")).data as { enabled: boolean; mock: boolean },
  });
  const canPayOnline = !!(payCfg?.enabled || payCfg?.mock);

  const qc = useQueryClient();
  const { data: pending } = useQuery({
    queryKey: ["pending"],
    queryFn: async () => (await api.get("/orders/pending")).data as { orders: PendingOrder[] },
    refetchInterval: 5000,
  });
  const pendingCount = pending?.orders.length ?? 0;

  const { data, isLoading } = useQuery({
    queryKey: ["menu"],
    queryFn: async () => (await api.get("/menu")).data as { categories: Category[] },
  });
  const categories = data?.categories ?? [];

  const allProducts = useMemo(
    () => categories.flatMap((c) => c.products),
    [categories]
  );

  const visible = useMemo(() => {
    let list = activeCat === "all" ? allProducts : allProducts.filter((p) => p.categoryId === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = allProducts.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [activeCat, search, allProducts]);

  // ── Cart ops ──────────────────────────────────────────────────────────────
  function addToCart(p: Product) {
    setCart((c) => {
      const found = c.find((l) => l.product.id === p.id);
      if (found) return c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { product: p, qty: 1 }];
    });
  }
  function changeQty(id: string, delta: number) {
    setCart((c) =>
      c
        .map((l) => (l.product.id === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }
  function removeLine(id: string) {
    setCart((c) => c.filter((l) => l.product.id !== id));
  }
  function clearCart() {
    setCart([]);
    setDiscount(0);
    setPhone("");
    setCustName("");
  }

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.qty, 0);
  const disc = Math.min(discount, subtotal);
  const tax = Math.round((subtotal - disc) * taxRate * 100) / 100;
  const total = Math.round((subtotal - disc + tax) * 100) / 100;
  const hasPrepared = cart.some((l) => l.product.kind === "PREPARED");

  return (
    <div className="flex h-full flex-col">
      {onlineOrder && (
        <OnlineOrderAlert order={onlineOrder} onDismiss={dismissOnline} onView={() => nav("/kds")} />
      )}
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2 font-bold">
          <span className="text-2xl">🍓</span>
          <span>{config?.storeName ?? "CafePOS"}</span>
        </div>
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or scan barcode…"
            className="w-full rounded-xl border border-slate-300 py-2 pl-10 pr-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <span
            title={online ? "Online" : "Offline — orders will sync when reconnected"}
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              online ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-700"
            )}
          >
            {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {online ? "Online" : "Offline"}
            {queued > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-white">{queued}</span>
            )}
          </span>
          <button
            onClick={() => setShowPending(true)}
            className="btn-ghost relative"
            title="Pending counter payments"
          >
            <Clock className="h-5 w-5" />
            {pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
          <Link to="/kds" className="btn-ghost" title="Kitchen Display">
            <Monitor className="h-5 w-5" />
          </Link>
          <Link to="/reports" className="btn-ghost" title="Reports">
            <BarChart3 className="h-5 w-5" />
          </Link>
          {user?.role === "ADMIN" && (
            <>
              <Link to="/kiosk" className="btn-ghost" title="Open kiosk mode">
                <Tablet className="h-5 w-5" />
              </Link>
              <Link to="/admin" className="btn-ghost" title="Manage store">
                <Settings className="h-5 w-5" />
              </Link>
            </>
          )}
          <span className="hidden text-sm text-slate-500 sm:inline">{user?.name}</span>
          <button
            className="btn-ghost"
            title="Sign out"
            onClick={() => {
              clearSession();
              nav("/login");
            }}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Products */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Category tabs */}
          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2">
            <button
              onClick={() => setActiveCat("all")}
              className={clsx(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold",
                activeCat === "all" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCat(c.id);
                  setSearch("");
                }}
                className={clsx(
                  "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold",
                  activeCat === c.id ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                )}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <p className="text-slate-400">Loading menu…</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visible.map((p) => {
                  const out = p.stock !== null && p.stock <= 0;
                  return (
                    <button
                      key={p.id}
                      disabled={out}
                      onClick={() => addToCart(p)}
                      style={{ backgroundColor: p.color }}
                      className={clsx(
                        "relative flex h-32 flex-col items-start justify-between rounded-2xl p-3 text-left shadow-sm ring-1 ring-black/5 transition active:scale-95",
                        out && "opacity-40"
                      )}
                    >
                      <span className="text-3xl">{p.emoji}</span>
                      <span className="line-clamp-2 text-sm font-semibold leading-tight text-slate-800">
                        {p.name}
                      </span>
                      <span className="flex w-full items-center justify-between">
                        <span className="font-bold text-slate-900">{money(p.price)}</span>
                        {p.kind === "PREPARED" && (
                          <span className="rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            MADE
                          </span>
                        )}
                      </span>
                      {p.stock !== null && (
                        <span className="absolute right-2 top-2 rounded-full bg-white/70 px-1.5 text-[10px] font-semibold text-slate-600">
                          {out ? "Out" : p.stock}
                        </span>
                      )}
                    </button>
                  );
                })}
                {visible.length === 0 && <p className="text-slate-400">No products.</p>}
              </div>
            )}
          </div>
        </main>

        {/* Cart */}
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-bold">Current order</h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-sm text-slate-400 hover:text-red-500">
                Clear
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {cart.length === 0 ? (
              <p className="mt-10 text-center text-sm text-slate-400">
                Tap products to add them
              </p>
            ) : (
              cart.map((l) => (
                <div key={l.product.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                  <span className="text-xl">{l.product.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.product.name}</p>
                    <p className="text-xs text-slate-500">{money(l.product.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeQty(l.product.id, -1)} className="rounded-lg bg-slate-100 p-1.5">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center font-semibold">{l.qty}</span>
                    <button onClick={() => changeQty(l.product.id, 1)} className="rounded-lg bg-slate-100 p-1.5">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="w-16 text-right text-sm font-bold">
                    {money(l.product.price * l.qty)}
                  </span>
                  <button onClick={() => removeLine(l.product.id)} className="text-slate-300 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Totals + pay */}
          <div className="border-t border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-semibold">{money(subtotal)}</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Discount ₹</span>
              <input
                type="number"
                min={0}
                value={discount || ""}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right"
                placeholder="0"
              />
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Tax ({Math.round(taxRate * 100)}%)</span>
              <span className="font-semibold">{money(tax)}</span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Customer name"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                placeholder="Phone (earns points)"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="mb-3 flex items-center justify-between text-lg">
              <span className="font-bold">Total</span>
              <span className="font-extrabold text-brand-700">{money(total)}</span>
            </div>
            <button
              className="btn-primary w-full py-3 text-lg"
              disabled={cart.length === 0}
              onClick={() => setShowPay(true)}
            >
              Charge {money(total)}
            </button>
            {hasPrepared && (
              <p className="mt-2 text-center text-xs text-amber-600">
                Contains freshly-made items → kitchen ticket
              </p>
            )}
          </div>
        </aside>
      </div>

      {showPay && (
        <PayModal
          total={total}
          subtotal={subtotal}
          discount={disc}
          tax={tax}
          cart={cart}
          phone={phone}
          custName={custName}
          storeName={config?.storeName ?? "CafePOS"}
          canPayOnline={canPayOnline}
          demoMode={!!payCfg?.mock}
          onClose={() => setShowPay(false)}
          onDone={() => {
            setShowPay(false);
            clearCart();
          }}
        />
      )}

      {showPending && (
        <PendingModal
          orders={pending?.orders ?? []}
          onClose={() => setShowPending(false)}
          onSettled={() => {
            qc.invalidateQueries({ queryKey: ["pending"] });
            qc.invalidateQueries({ queryKey: ["kds"] });
          }}
        />
      )}
    </div>
  );
}

interface PendingOrder {
  id: string;
  number: number;
  total: number;
  tender: string | null;
  customerName: string | null;
  customer: { phone: string } | null;
  items: { id: string; name: string; qty: number }[];
}

function PendingModal({
  orders,
  onClose,
  onSettled,
}: {
  orders: PendingOrder[];
  onClose: () => void;
  onSettled: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function settle(o: PendingOrder, method: "CASH" | "CARD") {
    setBusyId(o.id);
    try {
      await api.post(`/orders/${o.id}/settle`, { method });
      toast.success(`Order #${o.number} settled — sent to kitchen`);
      onSettled();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not settle");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card flex max-h-[80vh] w-full max-w-lg flex-col p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-bold">Awaiting counter payment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-6 w-6" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {orders.length === 0 ? (
            <p className="py-10 text-center text-slate-400">No orders waiting for payment.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.id} className="rounded-xl ring-1 ring-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">#{o.number} · {o.tender ?? "—"}</span>
                    <span className="font-extrabold text-brand-700">{money(o.total)}</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {o.customerName ?? "Walk-in"}{o.customer?.phone ? ` · ${o.customer.phone}` : ""}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button onClick={() => settle(o, "CASH")} disabled={busyId === o.id} className="btn-primary py-2 text-sm">
                      Cash received
                    </button>
                    <button onClick={() => settle(o, "CARD")} disabled={busyId === o.id} className="btn-ghost py-2 text-sm ring-1 ring-slate-200">
                      Card received
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PLATFORM = {
  SWIGGY: { label: "Swiggy", bg: "#fc8019", emoji: "🛵" },
  ZOMATO: { label: "Zomato", bg: "#e23744", emoji: "🍽️" },
} as const;

function OnlineOrderAlert({
  order,
  onDismiss,
  onView,
}: {
  order: OnlineOrder;
  onDismiss: () => void;
  onView: () => void;
}) {
  // Auto-dismiss so alerts don't stack up during a rush.
  useEffect(() => {
    const t = setTimeout(onDismiss, 15000);
    return () => clearTimeout(t);
  }, [order.id, onDismiss]);

  const p = PLATFORM[order.source];
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 text-white animate-[pulse_1.2s_ease-in-out_2]"
      style={{ backgroundColor: p.bg }}
      role="alert"
    >
      <span className="text-2xl">{p.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight">
          New {p.label} order · #{order.number}
        </p>
        <p className="truncate text-sm text-white/90">
          {order.items.map((i) => `${i.qty}× ${i.name}`).join(", ")} · {money(order.total)}
        </p>
      </div>
      <button onClick={onView} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold hover:bg-white/30">
        View in kitchen
      </button>
      <button onClick={onDismiss} className="rounded-lg p-1.5 hover:bg-white/20" aria-label="Dismiss">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function PayModal(props: {
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  cart: CartLine[];
  phone: string;
  custName: string;
  storeName: string;
  canPayOnline: boolean;
  demoMode: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { total, cart, phone, custName, discount, storeName, canPayOnline } = props;
  const payCfgMock = props.demoMode;
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [tendered, setTendered] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ReceiptOrder | null>(null);

  const change = method === "CASH" ? Math.max(0, tendered - total) : 0;
  const quickCash = [total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  async function pay() {
    if (method === "CASH" && tendered < total) {
      toast.error("Cash is less than total");
      return;
    }
    setBusy(true);
    const payload = {
      source: "POS",
      items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
      discount,
      payment: { method, tendered: method === "CASH" ? tendered : undefined },
      customerPhone: phone || undefined,
      customerName: custName || undefined,
    };

    // Offline: queue the sale locally, print a provisional receipt, sync later.
    if (!navigator.onLine) {
      try {
        const q = await enqueue(payload);
        setDone(buildLocalOrder(q.ref));
        toast.message("Saved offline — will sync when online");
      } catch {
        toast.error("Could not save order offline");
      } finally {
        setBusy(false);
      }
      return;
    }

    try {
      const { data } = await api.post("/checkout", payload);
      setDone(data.order as ReceiptOrder);
      toast.success(`Order #${data.order.number} paid`);
    } catch (e: any) {
      // Network died mid-request → fall back to the offline queue.
      if (!e?.response) {
        const q = await enqueue(payload);
        setDone(buildLocalOrder(q.ref));
        toast.message("Saved offline — will sync when online");
      } else {
        toast.error(e?.response?.data?.error ?? "Payment failed");
      }
    } finally {
      setBusy(false);
    }
  }

  // Pay via Razorpay (UPI / card / QR). Server verifies the payment and creates the order.
  async function payOnline() {
    if (!navigator.onLine) {
      toast.error("Online payment needs internet — use Cash/UPI/Card");
      return;
    }
    setBusy(true);
    try {
      const order = await payWithRazorpay({
        source: "POS",
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
        discount,
        customerPhone: phone || undefined,
        customerName: custName || undefined,
        storeName,
      });
      setDone(order as ReceiptOrder);
      toast.success(`Order #${order.number} paid online`);
    } catch (e: any) {
      if (e instanceof PaymentCancelled) toast.message("Payment cancelled");
      else toast.error(e?.response?.data?.error ?? "Online payment failed");
    } finally {
      setBusy(false);
    }
  }

  // Build a provisional receipt order from the current cart for offline sales.
  function buildLocalOrder(ref: string): ReceiptOrder {
    return {
      number: ref as unknown as number, // shown as-is on the slip (e.g. "OFF-123456")
      createdAt: new Date().toISOString(),
      subtotal: props.subtotal,
      discount: props.discount,
      tax: props.tax,
      total,
      items: cart.map((l) => ({
        id: l.product.id,
        name: l.product.name,
        qty: l.qty,
        unitPrice: l.product.price,
        lineTotal: l.product.price * l.qty,
        kind: l.product.kind,
        modifiers: [],
      })),
      payment: {
        method,
        tendered: method === "CASH" ? tendered : undefined,
        change: method === "CASH" ? Math.max(0, tendered - total) : 0,
      },
    };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        {done ? (
          <div className="text-center">
            <div className="text-6xl">✅</div>
            <h3 className="mt-2 text-2xl font-bold">Order #{done.number}</h3>
            {method === "CASH" && (done.payment?.change ?? 0) > 0 && (
              <p className="mt-1 text-lg">
                Change due:{" "}
                <span className="font-bold text-brand-700">{money(done.payment!.change)}</span>
              </p>
            )}
            <p className="mt-1 text-sm text-slate-500">
              {cart.some((l) => l.product.kind === "PREPARED")
                ? "Prepared items sent to the kitchen display."
                : "Handed over — ready-made, no wait."}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button className="btn-ghost py-3" onClick={() => window.print()}>
                Print receipt
              </button>
              <button className="btn-primary py-3" onClick={props.onDone}>
                New order
              </button>
            </div>
            <Receipt
              order={done}
              storeName={storeName}
              hasPrepared={cart.some((l) => l.product.kind === "PREPARED")}
            />
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold">Payment</h3>
              <button onClick={props.onClose} className="text-slate-400 hover:text-slate-700">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="mb-4 rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-sm text-slate-500">Amount due</p>
              <p className="text-4xl font-extrabold text-brand-700">{money(total)}</p>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {(["CASH", "UPI", "CARD"] as PayMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={clsx(
                    "rounded-xl py-3 font-bold",
                    method === m ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            {method === "CASH" && (
              <div className="mb-4">
                <div className="mb-2 grid grid-cols-4 gap-2">
                  {quickCash.map((v) => (
                    <button
                      key={v}
                      onClick={() => setTendered(v)}
                      className="rounded-lg bg-slate-100 py-2 text-sm font-semibold"
                    >
                      {money(v)}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={tendered || ""}
                  onChange={(e) => setTendered(Number(e.target.value))}
                  placeholder="Cash received"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-right text-lg"
                />
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-slate-500">Change</span>
                  <span className="font-bold">{money(change)}</span>
                </div>
              </div>
            )}
            <button className="btn-primary w-full py-3 text-lg" onClick={pay} disabled={busy}>
              {busy ? "Processing…" : `Confirm ${method}`}
            </button>
            {canPayOnline && (
              <>
                <div className="my-3 flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  className="btn-ghost w-full py-3 text-base font-bold ring-2 ring-brand-200"
                  onClick={payOnline}
                  disabled={busy}
                >
                  📲 Pay online — UPI / Card / QR
                </button>
                {payCfgMock && (
                  <p className="mt-1 text-center text-[11px] text-amber-600">
                    Demo mode — add Razorpay keys for real payments
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
