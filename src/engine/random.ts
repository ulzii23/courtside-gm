// Seeded RNG so a league's results are reproducible from its saved seed.
let state = (Date.now() ^ 0x9e3779b9) >>> 0;

export function seed(s: number) {
  state = s >>> 0;
}
export function getSeed() {
  return state;
}

export function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
export const chance = (p: number) => random() < p;

// Approximately normal (sum of uniforms).
export function gauss(mean = 0, sd = 1) {
  return mean + sd * (random() + random() + random() + random() + random() + random() - 3) / 0.7071;
}

export function pickWeighted<T>(items: T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  let r = random() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Deterministic 0-1 values derived from a string (used for personality traits).
export function hashUnit(str: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
