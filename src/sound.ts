// Game sounds, synthesized with the Web Audio API (no audio files to load).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const KEY = 'cgm-sound';
let enabled = (() => {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
})();
const listeners = new Set<() => void>();

export const soundOn = () => enabled;
export function setSound(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
  for (const l of listeners) l();
  if (on) play('click');
}
export function onSoundChange(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// One note with a quick attack and exponential decay.
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slideTo?: number) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Short filtered noise burst (crowd, swish, sneaker-ish textures).
function noise(start: number, dur: number, vol = 0.3, freq = 1200, q = 0.8) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + start;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export type Sound =
  | 'click' | 'aiPick' | 'draft' | 'onClock' | 'tick' | 'win' | 'loss' | 'tradeOk' | 'tradeNo'
  | 'sign' | 'champion' | 'buzzer' | 'swish';

const SOUNDS: Record<Sound, () => void> = {
  click: () => tone(1800, 0, 0.035, 'triangle', 0.12),
  aiPick: () => tone(660, 0, 0.08, 'triangle', 0.12),
  // Ball through the net + a confirming two-note chime.
  draft: () => { noise(0, 0.18, 0.25, 3500, 1.2); tone(784, 0.05, 0.18, 'triangle', 0.35); tone(1175, 0.15, 0.3, 'triangle', 0.35); },
  swish: () => noise(0, 0.22, 0.3, 3800, 1.4),
  // Arena-style alert: rising three-note call.
  onClock: () => { tone(523, 0, 0.14, 'square', 0.18); tone(659, 0.13, 0.14, 'square', 0.18); tone(880, 0.26, 0.3, 'square', 0.2); },
  tick: () => tone(1320, 0, 0.05, 'square', 0.12),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.28, 'triangle', 0.32));
    noise(0.15, 0.9, 0.12, 900, 0.4); // crowd roar
  },
  loss: () => { tone(392, 0, 0.28, 'sine', 0.3); tone(311, 0.22, 0.45, 'sine', 0.3); },
  tradeOk: () => { [880, 1109, 1319].forEach((f, i) => tone(f, i * 0.07, 0.2, 'sine', 0.3)); tone(1760, 0.24, 0.35, 'sine', 0.2); },
  tradeNo: () => tone(180, 0, 0.32, 'sawtooth', 0.18, 120),
  sign: () => { tone(988, 0, 0.12, 'triangle', 0.3); tone(1319, 0.09, 0.25, 'triangle', 0.3); },
  buzzer: () => { tone(220, 0, 0.7, 'sawtooth', 0.2); tone(223, 0, 0.7, 'square', 0.12); },
  champion: () => {
    const notes = [523, 523, 523, 659, 784, 659, 784, 1047];
    const times = [0, 0.14, 0.28, 0.42, 0.62, 0.82, 0.96, 1.16];
    notes.forEach((f, i) => { tone(f, times[i], i === notes.length - 1 ? 0.9 : 0.2, 'square', 0.18); tone(f / 2, times[i], 0.2, 'triangle', 0.15); });
    noise(0.3, 2.2, 0.15, 800, 0.3);
  },
};

export function play(s: Sound) {
  if (!enabled) return;
  try { SOUNDS[s](); } catch { /* audio unavailable */ }
}
