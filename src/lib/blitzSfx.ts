// Hafif Web Audio tabanlı SFX — harici varlık yok, sadece OscillatorNode.
// Kullanıcı tercihine göre kapatılabilir (localStorage 'blitz_sfx_off').
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (localStorage.getItem("blitz_sfx_off") === "1") return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = AC ? new AC() : null;
    } catch { ctx = null; }
  }
  return ctx;
}

function beep(freq: number, dur = 0.12, type: OscillatorType = "sine", gain = 0.08) {
  const c = getCtx(); if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start(); o.stop(c.currentTime + dur);
}

export const blitzSfx = {
  tick: () => beep(880, 0.04, "square", 0.04),
  open: () => { beep(523, 0.08, "triangle"); setTimeout(() => beep(784, 0.1, "triangle"), 70); },
  close: () => { beep(659, 0.08, "triangle"); setTimeout(() => beep(440, 0.1, "triangle"), 70); },
  win: () => {
    beep(523, 0.12, "triangle");
    setTimeout(() => beep(659, 0.12, "triangle"), 120);
    setTimeout(() => beep(784, 0.14, "triangle"), 240);
    setTimeout(() => beep(1046, 0.22, "triangle", 0.1), 380);
  },
  lose: () => {
    beep(330, 0.18, "sawtooth", 0.06);
    setTimeout(() => beep(220, 0.28, "sawtooth", 0.06), 180);
  },
  countdown: () => beep(1320, 0.06, "square", 0.06),
};

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch { /* noop */ }
  }
}
