import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { playNewOrderChime } from "./sound";

export interface OnlineOrder {
  id: string;
  number: number;
  source: "SWIGGY" | "ZOMATO";
  total: number;
  createdAt: string;
  items: { id: string; name: string; qty: number }[];
}

/**
 * Polls the Swiggy/Zomato feed every few seconds. When a new order lands it plays
 * the chime and hands the order back so the POS can flash an alert banner. Cheap
 * near-realtime with no WebSocket server to run.
 */
export function useOnlineOrders(enabled = true) {
  const [latest, setLatest] = useState<OnlineOrder | null>(null);
  // Start the clock at mount so we never replay orders from before the till opened.
  const since = useRef<string>(new Date().toISOString());

  useEffect(() => {
    if (!enabled) return;
    let stop = false;

    async function poll() {
      try {
        const { data } = await api.get("/channels/orders", { params: { since: since.current } });
        const orders: OnlineOrder[] = data.orders ?? [];
        if (orders.length > 0) {
          since.current = data.now ?? new Date().toISOString();
          playNewOrderChime();
          setLatest(orders[orders.length - 1]);
        } else if (data.now) {
          since.current = data.now;
        }
      } catch {
        // offline / transient — try again next tick
      }
    }

    const id = setInterval(() => {
      if (!stop) poll();
    }, 4000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [enabled]);

  return { latest, dismiss: () => setLatest(null) };
}
