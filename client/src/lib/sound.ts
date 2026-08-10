// New-order chime via the Web Audio API — no audio file to ship or host.
// Browsers block audio until a user gesture, so we lazily create/resume the
// context on the first interaction (unlockAudio is called once on app mount).
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Call once, from a user-gesture handler, to satisfy autoplay policies. */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

/** A friendly two-note "ding-dong" that carries across a noisy café. */
export function playNewOrderChime() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  const notes = [
    { f: 880, t: 0 },
    { f: 1174.7, t: 0.16 },
    { f: 880, t: 0.34 },
  ];
  for (const n of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = n.f;
    gain.gain.setValueAtTime(0.0001, now + n.t);
    gain.gain.exponentialRampToValueAtTime(0.25, now + n.t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + 0.18);
    osc.connect(gain).connect(c.destination);
    osc.start(now + n.t);
    osc.stop(now + n.t + 0.2);
  }
}
