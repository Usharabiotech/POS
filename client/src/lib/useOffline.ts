import { useEffect, useState } from "react";
import { toast } from "sonner";
import { flushQueue, queueCount, onQueueChange } from "./offline";

/**
 * Tracks connectivity + how many orders are waiting to sync, and auto-flushes
 * the queue when the connection returns.
 */
export function useOffline() {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [queued, setQueued] = useState<number>(0);

  useEffect(() => {
    const refresh = () => queueCount().then(setQueued).catch(() => {});
    refresh();
    const off = onQueueChange(refresh);

    const goOnline = async () => {
      setOnline(true);
      const n = await flushQueue();
      if (n > 0) toast.success(`Synced ${n} offline order${n > 1 ? "s" : ""}`);
      refresh();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Attempt a flush on mount in case we reloaded with a pending queue.
    if (navigator.onLine) goOnline();

    return () => {
      off();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return { online, queued };
}
