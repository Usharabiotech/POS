import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Plus, Minus, ArrowLeft, ShoppingBag, Lock, Maximize, Minimize, LogOut, X, Delete,
  Banknote, CreditCard, Smartphone, MessageCircle,
} from "lucide-react";
import clsx from "clsx";
import { api, type Category, type Product } from "../api";

const money = (n: number) => "₹" + n.toFixed(2);

interface Line {
  product: Product;
  qty: number;
}
type Step = "browse" | "review" | "details" | "tender" | "counter" | "upi" | "done";

function enterFullscreen() {
  const el = document.documentElement as any;
  (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
}
function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

export default function Kiosk() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("browse");
  const [cat, setCat] = useState<string>("all");
  const [cart, setCart] = useState<Line[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState<number | null>(null);
  const [tenderPaid, setTenderPaid] = useState<"UPI" | "COUNTER" | null>(null);
  const [busy, setBusy] = useState(false);

  // UPI payment
  const [orderId, setOrderId] = useState<string | null>(null);
  const [upi, setUpi] = useState<{ url: string; mock: boolean; amount: number } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  // Manager lock
  const [lockOpen, setLockOpen] = useState(false);
  const [isFs, setIsFs] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: async () =>
      (await api.get("/config")).data as { storeName: string; taxRate: number; kioskPin: string },
  });
  const { data } = useQuery({
    queryKey: ["menu"],
    queryFn: async () => (await api.get("/menu")).data as { categories: Category[] },
  });
  const categories = data?.categories ?? [];
  const all = useMemo(() => categories.flatMap((c) => c.products), [categories]);
  const visible = cat === "all" ? all : all.filter((p) => p.categoryId === cat);

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = cart.reduce((s, l) => s + l.product.price * l.qty, 0);
  const taxRate = config?.taxRate ?? 0.05;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  // Kiosk lockdown.
  useEffect(() => {
    const goFs = () => enterFullscreen();
    window.addEventListener("pointerdown", goFs, { once: true });
    const onFsChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    const blockMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", blockMenu);
    return () => {
      window.removeEventListener("pointerdown", goFs);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("contextmenu", blockMenu);
    };
  }, []);

  // Render the UPI QR when the payment link arrives.
  useEffect(() => {
    if (upi?.url) QRCode.toDataURL(upi.url, { width: 260, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [upi]);

  // Poll for the payment handshake while on the UPI screen.
  useEffect(() => {
    if (step !== "upi" || !orderId) return;
    let stop = false;
    const id = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/upi/status/${orderId}`);
        if (data.paid && !stop) {
          setTenderPaid("UPI");
          setStep("done");
        }
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [step, orderId]);

  function add(p: Product) {
    setCart((c) => {
      const f = c.find((l) => l.product.id === p.id);
      if (f) return c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { product: p, qty: 1 }];
    });
  }
  function change(id: string, d: number) {
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  }
  function reset() {
    setCart([]); setName(""); setPhone(""); setToken(null); setTenderPaid(null);
    setOrderId(null); setUpi(null); setQrDataUrl(""); setCat("all"); setStep("browse");
  }

  async function placeOrder(tender: "CASH" | "CARD" | "UPI") {
    setBusy(true);
    try {
      const { data } = await api.post("/kiosk/order", {
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
        customerName: name.trim(),
        customerPhone: phone.trim(),
        tender,
      });
      setToken(data.order.number);
      setOrderId(data.order.id);
      if (tender === "UPI") {
        const start = (await api.post("/payments/upi/start", { orderId: data.order.id })).data;
        setUpi({ url: start.url, mock: !!start.mock, amount: start.amount });
        setStep("upi");
      } else {
        setTenderPaid("COUNTER");
        setStep("counter");
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Could not place order");
    } finally {
      setBusy(false);
    }
  }

  async function simulatePaid() {
    if (!orderId) return;
    try {
      await api.post(`/payments/upi/mock-pay/${orderId}`);
      // the poll will flip to done; nudge immediately too
      setTenderPaid("UPI");
      setStep("done");
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Failed");
    }
  }

  function sendWhatsApp() {
    if (!upi) return;
    const msg = `Pay ${money(upi.amount)} for your ${config?.storeName ?? "cafe"} order #${token}: ${upi.url}`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  const phoneValid = /^\d{10}$/.test(phone.trim());
  const nameValid = name.trim().length > 0;

  // ── Steps ──────────────────────────────────────────────────────────────
  let content: React.ReactNode;

  if (step === "done") {
    content = (
      <ResultScreen
        emoji="✅"
        title={tenderPaid === "UPI" ? "Payment successful 🎉" : "Order placed!"}
        token={token}
        subtitle={tenderPaid === "UPI" ? "Collect your order when your token is called" : ""}
        onReset={reset}
      />
    );
  } else if (step === "counter") {
    content = (
      <ResultScreen
        emoji="🧾"
        title="Please pay at the counter"
        token={token}
        subtitle={`Show token #${token} and pay ${money(total)}. Your order starts once payment is received.`}
        onReset={reset}
      />
    );
  } else if (step === "upi") {
    content = (
      <div className="flex min-h-full flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <h1 className="text-3xl font-extrabold">Scan &amp; Pay {money(upi?.amount ?? total)}</h1>
        <p className="mt-1 text-slate-500">Token #{token} · pay with any UPI app</p>
        <div className="my-5 rounded-3xl bg-white p-5 shadow ring-1 ring-slate-200">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="UPI QR" className="h-64 w-64" />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center text-slate-400">Generating QR…</div>
          )}
        </div>
        <div className="flex items-center gap-2 text-brand-700">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-brand-500" />
          <span className="font-semibold">Waiting for payment…</span>
        </div>
        <button onClick={sendWhatsApp} className="btn-ghost mt-5 py-3 text-base ring-2 ring-emerald-200">
          <MessageCircle className="h-5 w-5 text-emerald-600" /> Send payment link to WhatsApp
        </button>
        {upi?.mock && (
          <button onClick={simulatePaid} className="btn-primary mt-3 py-3">
            ✓ Simulate payment received (demo)
          </button>
        )}
        <button onClick={reset} className="mt-6 text-sm text-slate-400">Cancel</button>
      </div>
    );
  } else if (step === "tender") {
    content = (
      <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center p-6">
        <button onClick={() => setStep("details")} className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-500">
          <ArrowLeft className="h-6 w-6" /> Back
        </button>
        <h1 className="mb-1 text-3xl font-extrabold">How would you like to pay?</h1>
        <p className="mb-6 text-lg text-slate-500">Total {money(total)}</p>
        <div className="grid gap-4">
          <TenderBtn icon={<Smartphone className="h-8 w-8" />} label="UPI" hint="Scan a QR on this screen" onClick={() => placeOrder("UPI")} disabled={busy} accent />
          <TenderBtn icon={<Banknote className="h-8 w-8" />} label="Cash" hint="Pay at the counter" onClick={() => placeOrder("CASH")} disabled={busy} />
          <TenderBtn icon={<CreditCard className="h-8 w-8" />} label="Card" hint="Pay at the counter" onClick={() => placeOrder("CARD")} disabled={busy} />
        </div>
      </div>
    );
  } else if (step === "details") {
    content = (
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center p-6">
        <button onClick={() => setStep("review")} className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-500">
          <ArrowLeft className="h-6 w-6" /> Back to order
        </button>
        <h1 className="mb-1 text-3xl font-extrabold">Your details</h1>
        <p className="mb-6 text-slate-500">So we can call your name and share updates.</p>
        <label className="mb-1 block text-sm font-semibold text-slate-600">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="mb-4 w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg"
        />
        <label className="mb-1 block text-sm font-semibold text-slate-600">Mobile number</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          inputMode="numeric"
          placeholder="10-digit mobile"
          className="mb-2 w-full rounded-2xl border border-slate-300 px-5 py-4 text-lg tracking-widest"
        />
        {!phoneValid && phone.length > 0 && <p className="mb-2 text-sm text-red-500">Enter a 10-digit number</p>}
        <button
          disabled={!nameValid || !phoneValid}
          onClick={() => setStep("tender")}
          className="btn-primary mt-4 w-full py-5 text-2xl"
        >
          Continue to payment
        </button>
      </div>
    );
  } else if (step === "review") {
    content = (
      <div className="mx-auto flex min-h-full max-w-2xl flex-col p-6">
        <button onClick={() => setStep("browse")} className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-500">
          <ArrowLeft className="h-6 w-6" /> Add more
        </button>
        <h1 className="mb-4 text-3xl font-extrabold">Your order</h1>
        <div className="flex-1 space-y-3">
          {cart.map((l) => (
            <div key={l.product.id} className="card flex items-center gap-4 p-4">
              <span className="text-4xl">{l.product.emoji}</span>
              <div className="flex-1">
                <p className="text-lg font-bold">{l.product.name}</p>
                <p className="text-slate-500">{money(l.product.price)}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => change(l.product.id, -1)} className="rounded-xl bg-slate-100 p-3"><Minus className="h-6 w-6" /></button>
                <span className="w-8 text-center text-2xl font-bold">{l.qty}</span>
                <button onClick={() => change(l.product.id, 1)} className="rounded-xl bg-slate-100 p-3"><Plus className="h-6 w-6" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1 text-lg">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Tax</span><span>{money(tax)}</span></div>
          <div className="flex justify-between text-2xl font-extrabold"><span>Total</span><span className="text-brand-700">{money(total)}</span></div>
        </div>
        <button onClick={() => setStep("details")} disabled={cart.length === 0} className="btn-primary mt-4 w-full py-5 text-2xl">
          Proceed to pay
        </button>
      </div>
    );
  } else {
    content = (
      <div className="flex h-full flex-col bg-slate-50">
        <header className="flex items-center justify-between bg-brand-600 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🍓</span>
            <div>
              <h1 className="text-2xl font-extrabold leading-none">{config?.storeName ?? "Order Here"}</h1>
              <p className="text-sm text-white/80">Tap items to build your order</p>
            </div>
          </div>
        </header>
        <div className="flex gap-3 overflow-x-auto bg-white px-6 py-3 shadow-sm">
          <CatBtn active={cat === "all"} onClick={() => setCat("all")}>All</CatBtn>
          {categories.map((c) => (
            <CatBtn key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.emoji} {c.name}</CatBtn>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-28">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {visible.map((p) => {
              const out = p.stock !== null && p.stock <= 0;
              const inCart = cart.find((l) => l.product.id === p.id)?.qty ?? 0;
              return (
                <button
                  key={p.id}
                  disabled={out}
                  onClick={() => add(p)}
                  style={{ backgroundColor: p.color }}
                  className={clsx("relative flex h-44 flex-col items-center justify-center gap-2 rounded-3xl p-4 text-center shadow-sm ring-1 ring-black/5 transition active:scale-95", out && "opacity-40")}
                >
                  {inCart > 0 && (
                    <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">{inCart}</span>
                  )}
                  <span className="text-5xl">{p.emoji}</span>
                  <span className="text-base font-bold leading-tight text-slate-800">{p.name}</span>
                  <span className="text-lg font-extrabold text-slate-900">{money(p.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
        {count > 0 && (
          <div className="absolute inset-x-0 bottom-0 p-4">
            <button onClick={() => setStep("review")} className="btn-primary flex w-full items-center justify-between px-6 py-5 text-xl shadow-lg">
              <span className="flex items-center gap-3"><ShoppingBag className="h-6 w-6" />{count} item{count > 1 ? "s" : ""}</span>
              <span>Review order · {money(total)}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full select-none">
      {content}
      <button
        onClick={() => setLockOpen(true)}
        className="absolute bottom-3 left-3 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-black/20 text-white/80 backdrop-blur hover:bg-black/40"
        title="Manager menu"
        aria-label="Manager menu"
      >
        <Lock className="h-5 w-5" />
      </button>
      {lockOpen && (
        <ManagerLock
          pin={config?.kioskPin ?? "1010"}
          isFs={isFs}
          onClose={() => setLockOpen(false)}
          onToggleFs={() => (isFs ? exitFullscreen() : enterFullscreen())}
          onExit={() => { exitFullscreen(); nav("/"); }}
        />
      )}
    </div>
  );
}

function ResultScreen({ emoji, title, token, subtitle, onReset }: {
  emoji: string; title: string; token: number | null; subtitle: string; onReset: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-brand-600 p-8 text-center text-white">
      <div className="text-8xl">{emoji}</div>
      <h1 className="mt-6 text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-xl text-white/80">Your token number</p>
      <div className="my-4 rounded-3xl bg-white px-16 py-8 text-8xl font-black text-brand-700">{token}</div>
      {subtitle && <p className="max-w-md text-lg text-white/85">{subtitle}</p>}
      <button onClick={onReset} className="mt-10 rounded-2xl bg-white px-10 py-4 text-xl font-bold text-brand-700">
        Start new order
      </button>
    </div>
  );
}

function TenderBtn({ icon, label, hint, onClick, disabled, accent }: {
  icon: React.ReactNode; label: string; hint: string; onClick: () => void; disabled?: boolean; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex items-center gap-5 rounded-2xl p-6 text-left ring-1 transition active:scale-[.98] disabled:opacity-50",
        accent ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-800 ring-slate-200"
      )}
    >
      <span className={clsx("flex h-16 w-16 items-center justify-center rounded-2xl", accent ? "bg-white/20" : "bg-slate-100")}>{icon}</span>
      <span>
        <span className="block text-2xl font-extrabold">{label}</span>
        <span className={clsx("text-sm", accent ? "text-white/80" : "text-slate-500")}>{hint}</span>
      </span>
    </button>
  );
}

function ManagerLock({ pin, isFs, onClose, onToggleFs, onExit }: {
  pin: string; isFs: boolean; onClose: () => void; onToggleFs: () => void; onExit: () => void;
}) {
  const [entry, setEntry] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState(false);

  function press(d: string) { setErr(false); setEntry((entry + d).slice(0, 8)); }
  function submit(value = entry) {
    if (value === pin) { setAuthed(true); setErr(false); }
    else { setErr(true); setEntry(""); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-2xl">
        {!authed ? (
          <>
            <div className="mb-1 flex items-center justify-center gap-2 text-slate-800">
              <Lock className="h-5 w-5" /><h3 className="text-lg font-bold">Manager PIN</h3>
            </div>
            <p className="mb-4 text-sm text-slate-500">Staff only — enter PIN to unlock</p>
            <div className={clsx("mb-4 flex justify-center gap-2", err && "animate-[pulse_.4s_ease-in-out_2]")}>
              {Array.from({ length: Math.max(4, entry.length) }).map((_, i) => (
                <span key={i} className={clsx("h-3.5 w-3.5 rounded-full", i < entry.length ? "bg-brand-600" : "bg-slate-200")} />
              ))}
            </div>
            {err && <p className="mb-2 text-sm font-semibold text-red-500">Wrong PIN, try again</p>}
            <div className="grid grid-cols-3 gap-2">
              {["1","2","3","4","5","6","7","8","9"].map((d) => (
                <button key={d} onClick={() => press(d)} className="rounded-xl bg-slate-100 py-4 text-2xl font-bold active:scale-95">{d}</button>
              ))}
              <button onClick={() => setEntry("")} className="rounded-xl bg-slate-100 py-4 text-sm font-semibold text-slate-500 active:scale-95">Clear</button>
              <button onClick={() => press("0")} className="rounded-xl bg-slate-100 py-4 text-2xl font-bold active:scale-95">0</button>
              <button onClick={() => setEntry(entry.slice(0, -1))} className="flex items-center justify-center rounded-xl bg-slate-100 py-4 active:scale-95"><Delete className="h-6 w-6 text-slate-500" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={onClose} className="btn-ghost py-3">Cancel</button>
              <button onClick={() => submit()} className="btn-primary py-3">Unlock</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="mb-1 text-lg font-bold">Manager menu</h3>
            <p className="mb-4 text-sm text-slate-500">Kiosk controls</p>
            <div className="grid gap-2">
              <button onClick={onToggleFs} className="btn-ghost justify-start py-3">
                {isFs ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                {isFs ? "Exit fullscreen (windowed)" : "Enter fullscreen"}
              </button>
              <button onClick={onExit} className="btn-ghost justify-start py-3 text-red-600"><LogOut className="h-5 w-5" /> Exit kiosk mode</button>
              <button onClick={onClose} className="btn-primary py-3"><X className="h-5 w-5" /> Back to kiosk</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CatBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={clsx("whitespace-nowrap rounded-full px-5 py-2.5 text-base font-bold", active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600")}>
      {children}
    </button>
  );
}
