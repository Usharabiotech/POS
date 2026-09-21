// Automatic day-close schedule. The EOD ZIP is built in the browser and saved to the
// device's Downloads folder, so the auto-run must happen on a device that stays on (the
// billing/admin PC) with the app open. The schedule + last-run marker live per device.

export interface EodSchedule {
  enabled: boolean;
  /** 24h "HH:MM" local time to run the auto day-close. */
  time: string;
}

const KEY = "eod.schedule";
const RUN_KEY = "eod.lastRunDate";

export function loadSchedule(): EodSchedule {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as EodSchedule;
      if (typeof s.enabled === "boolean" && /^\d{2}:\d{2}$/.test(s.time)) return s;
    }
  } catch {
    /* ignore */
  }
  return { enabled: false, time: "23:30" };
}

export function saveSchedule(s: EodSchedule): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getLastRun(): string | null {
  try {
    return localStorage.getItem(RUN_KEY);
  } catch {
    return null;
  }
}

export function setLastRun(date: string): void {
  try {
    localStorage.setItem(RUN_KEY, date);
  } catch {
    /* ignore */
  }
}

/** Local YYYY-MM-DD for the device (its clock is the store clock). */
export function localToday(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Current local time as "HH:MM". */
export function localHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
