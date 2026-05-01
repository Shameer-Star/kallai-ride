// Generates an attention-grabbing beep using WebAudio (no asset needed)
let ctx: AudioContext | null = null;
let stopFn: (() => void) | null = null;

function getCtx() {
  if (!ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function startAlertLoop() {
  stopAlertLoop();
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  let cancelled = false;
  const beep = () => {
    if (cancelled) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, c.currentTime + 0.25);
    gain.gain.setValueAtTime(0.001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, c.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.32);
  };
  beep();
  const interval = window.setInterval(beep, 900);
  stopFn = () => {
    cancelled = true;
    window.clearInterval(interval);
  };
}

export function stopAlertLoop() {
  if (stopFn) stopFn();
  stopFn = null;
}
