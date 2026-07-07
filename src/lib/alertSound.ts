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

export function playNotificationSound() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  
  const playBeep = (freq: number, start: number, duration: number) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    gain.gain.setValueAtTime(0.001, c.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.2, c.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + duration + 0.02);
  };

  // Pleasant double chime: 880Hz then 1046Hz (A5 then C6)
  playBeep(880, 0, 0.12);
  playBeep(1046, 0.15, 0.2);
}

