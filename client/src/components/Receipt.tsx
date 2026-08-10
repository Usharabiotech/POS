const money = (n: number) => "₹" + n.toFixed(2);

export interface ReceiptOrder {
  number: number;
  createdAt: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  items: {
    id: string;
    name: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    kind: "READYMADE" | "PREPARED";
    modifiers: string[];
  }[];
  payment?: { method: string; tendered?: number | null; change: number } | null;
}

/**
 * Printable 80mm receipt. Rendered off-canvas (.receipt-print) and revealed only
 * by the print stylesheet, so window.print() outputs just this slip.
 */
export function Receipt({
  order,
  storeName,
  hasPrepared,
}: {
  order: ReceiptOrder;
  storeName: string;
  hasPrepared: boolean;
}) {
  const dt = new Date(order.createdAt);
  return (
    <div className="receipt-print font-mono text-[12px] leading-tight text-black">
      <div className="text-center">
        <div className="text-base font-bold">{storeName}</div>
        <div>Fresh Fruit Cafe</div>
        <div className="my-1 border-t border-dashed border-black" />
      </div>

      <div className="flex justify-between">
        <span>Bill #{order.number}</span>
        <span>{dt.toLocaleDateString()}</span>
      </div>
      <div className="flex justify-between">
        <span>{dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="my-1 border-t border-dashed border-black" />

      {order.items.map((it) => (
        <div key={it.id} className="mb-1">
          <div className="flex justify-between">
            <span>
              {it.qty} × {it.name}
            </span>
            <span>{money(it.lineTotal)}</span>
          </div>
          {it.modifiers.length > 0 && (
            <div className="pl-3 text-[11px]">+ {it.modifiers.join(", ")}</div>
          )}
        </div>
      ))}

      <div className="my-1 border-t border-dashed border-black" />
      <Line label="Subtotal" value={money(order.subtotal)} />
      {order.discount > 0 && <Line label="Discount" value={"-" + money(order.discount)} />}
      <Line label="Tax" value={money(order.tax)} />
      <div className="flex justify-between text-[14px] font-bold">
        <span>TOTAL</span>
        <span>{money(order.total)}</span>
      </div>

      {order.payment && (
        <>
          <div className="my-1 border-t border-dashed border-black" />
          <Line label={`Paid (${order.payment.method})`} value={money(order.total)} />
          {order.payment.method === "CASH" && (
            <>
              <Line label="Tendered" value={money(order.payment.tendered ?? order.total)} />
              <Line label="Change" value={money(order.payment.change)} />
            </>
          )}
        </>
      )}

      {hasPrepared && (
        <>
          <div className="my-1 border-t border-dashed border-black" />
          <div className="text-center">
            <div className="text-[11px]">— TOKEN —</div>
            <div className="text-3xl font-extrabold">{order.number}</div>
            <div className="text-[11px]">Please wait for your token</div>
          </div>
        </>
      )}

      <div className="my-1 border-t border-dashed border-black" />
      <div className="text-center">Thank you! Visit again 🍓</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
