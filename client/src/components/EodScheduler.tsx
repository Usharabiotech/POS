import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getToken, getUser } from "../api";
import { loadSchedule, getLastRun, setLastRun, localToday, localHHMM } from "../lib/eodSchedule";

/**
 * Runs the automatic day-close while the app is open on this device. Renders nothing.
 * Checks each minute: if the schedule is on, the local time has reached the set time,
 * and today hasn't run yet, it downloads the EOD ZIP and closes the day. Admin only
 * (the EOD endpoints require admin) — so it acts on the admin/billing device.
 */
export function EodScheduler() {
  const running = useRef(false);
  const erroredToday = useRef<string | null>(null);

  useEffect(() => {
    async function tick() {
      if (running.current) return;
      if (!getToken() || getUser()?.role !== "ADMIN") return;

      const s = loadSchedule();
      if (!s.enabled) return;

      const today = localToday();
      if (getLastRun() === today || erroredToday.current === today) return;
      if (localHHMM() < s.time) return; // not time yet

      running.current = true;
      try {
        const { downloadEOD } = await import("../lib/eod");
        const r = await downloadEOD();
        setLastRun(today);
        toast.success(
          `Auto day-close done — saved ${r.orderCount} invoice${r.orderCount === 1 ? "" : "s"} + report to this device.`
        );
      } catch (e: any) {
        erroredToday.current = today; // don't retry in a loop; owner can close manually
        toast.error("Automatic day-close failed — please close the day manually. " + (e?.response?.data?.error ?? ""));
      } finally {
        running.current = false;
      }
    }

    tick(); // check once on mount (catches a missed time if the app opens later)
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
