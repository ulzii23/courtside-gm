import type { Personality, Player, RatingKey, Ratings, RawPlayer, SeasonLine } from '../types';
import { RATING_KEYS } from '../types';
import { gauss, hashUnit, random } from './random';

// Each rating is a linear map of one real stat: [stat value at rating 25, stat value at rating 99].
// The sim converts ratings back with statFrom(), so a player's real stats and ratings stay consistent,
// and rating changes (progression) flow straight into simulated performance.
const MAP: Record<RatingKey, [number, number]> = {
  ins: [0.40, 0.62], // 2P%
  tp: [0.28, 0.44], // 3P%
  ft: [0.55, 0.92], // FT%
  drw: [0.10, 0.60], // FTA per FGA
  pas: [6, 45], // AST%
  hnd: [18, 6], // TOV% (lower is better)
  oiq: [-4, 9], // OBPM
  orb: [1, 15], // ORB%
  drb: [8, 33], // DRB%
  stl: [0.7, 3.2], // STL%
  blk: [0.2, 8], // BLK%
  def: [-2.5, 4.5], // DBPM
  usg: [12, 37], // USG%
  sta: [12, 38], // minutes per game a player can sustain
};

export const RATING_LABELS: Record<RatingKey, string> = {
  ins: 'Inside Scoring', tp: 'Three Point', ft: 'Free Throw', drw: 'Draw Fouls', pas: 'Passing',
  hnd: 'Ball Security', oiq: 'Offensive IQ', orb: 'Off. Rebound', drb: 'Def. Rebound', stl: 'Steal',
  blk: 'Block', def: 'Defensive IQ', usg: 'Shot Creation', sta: 'Stamina',
};

export const PERSONALITY_LABELS: Record<keyof Personality, string> = {
  lead: 'Leadership', ego: 'Ego', work: 'Work Ethic', clutch: 'Clutch', temper: 'Temper', team: 'Team First', loyal: 'Loyalty',
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function ratingFrom(key: RatingKey, stat: number): number {
  const [a, b] = MAP[key];
  return Math.round(clamp(25 + ((stat - a) / (b - a)) * 74, 1, 99));
}

export function statFrom(key: RatingKey, rating: number): number {
  const [a, b] = MAP[key];
  return a + ((rating - 25) / 74) * (b - a);
}

// Overall: a box plus-minus estimate rebuilt from the ratings, scaled to a 2K-style range.
export function ovr(r: Ratings): number {
  const bpm = statFrom('oiq', r.oiq) + statFrom('def', r.def);
  const mpg = statFrom('sta', r.sta);
  return Math.round(clamp(72 + 2.4 * bpm + 0.3 * (mpg - 24), 35, 99));
}

export function potential(ovrNow: number, age: number, work: number): number {
  const years = Math.max(0, 27 - age);
  return Math.round(clamp(ovrNow + years * (1.6 + work / 60), ovrNow, 99));
}

const seasonGames = (season: number) => (season === 2012 ? 66 : season === 2020 ? 72 : season === 2021 ? 72 : 82);

// Shrink a noisy rate toward a prior based on how many minutes it was measured over.
const shrink = (x: number, prior: number, minutes: number, k: number) => (x * minutes + prior * k) / (minutes + k);

export function emptyLine(season: number, team: string): SeasonLine {
  return {
    season, team, g: 0, gs: 0, min: 0, pts: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pm: 0,
  };
}

export function personalityFor(id: string, raw: Partial<RawPlayer> & { age: number }): Personality {
  const h = (salt: number) => hashUnit(id, salt) * 2 - 1; // -1..1
  const usg = raw.usg ?? 18;
  const per36pf = raw.mp ? ((raw.pf ?? 2) / raw.mp) * 36 : 3.5;
  return {
    lead: Math.round(clamp(35 + (raw.age - 22) * 3 + (raw.ws48 ?? 0.08) * 120 + h(1) * 22, 5, 99)),
    ego: Math.round(clamp(25 + (usg - 15) * 2.6 + h(2) * 22, 5, 99)),
    work: Math.round(clamp(62 + h(3) * 33, 5, 99)),
    clutch: Math.round(clamp(40 + (usg - 18) * 1.8 + h(4) * 28, 5, 99)),
    temper: Math.round(clamp(20 + per36pf * 7 + h(5) * 22, 5, 99)),
    team: Math.round(clamp(55 + ((raw.astP ?? 12) - 15) * 0.8 - (usg - 20) * 1.4 + h(6) * 22, 5, 99)),
    loyal: Math.round(clamp(52 + (raw.age - 26) * 1.2 + h(7) * 38, 5, 99)),
  };
}

export function playerFromRaw(raw: RawPlayer, season: number): Player {
  const minutes = raw.mp * raw.g;
  const per36 = (x: number) => (raw.mp > 0 ? (x / raw.mp) * 36 : 0);

  const fg3aTot = raw.fg3a * raw.g;
  const fg2aTot = raw.fg2a * raw.g;
  const ftaTot = raw.fta * raw.g;
  const tpPrior = 0.27 + 0.07 * Math.min(1, per36(raw.fg3a) / 3);
  const tpPct = (raw.fg3 * raw.g + tpPrior * 60) / (fg3aTot + 60);
  const insPct = (raw.fg2 * raw.g + 0.47 * 80) / (fg2aTot + 80);
  const ftPct = (raw.ft * raw.g + 0.72 * 30) / (ftaTot + 30);
  const fga = Math.max(raw.fga, 0.01);

  const ratings: Ratings = {
    ins: ratingFrom('ins', insPct),
    tp: ratingFrom('tp', tpPct),
    ft: ratingFrom('ft', ftPct),
    drw: ratingFrom('drw', shrink(raw.fta / fga, 0.25, minutes, 300)),
    pas: ratingFrom('pas', shrink(raw.astP, 9, minutes, 300)),
    hnd: ratingFrom('hnd', shrink(raw.tovP, 14, minutes, 300)),
    oiq: ratingFrom('oiq', shrink(raw.obpm, -2, minutes, 500)),
    orb: ratingFrom('orb', shrink(raw.orbP, 4, minutes, 300)),
    drb: ratingFrom('drb', shrink(raw.drbP, 13, minutes, 300)),
    stl: ratingFrom('stl', shrink(raw.stlP, 1.3, minutes, 300)),
    blk: ratingFrom('blk', shrink(raw.blkP, 1.2, minutes, 300)),
    def: ratingFrom('def', shrink(raw.dbpm, -0.8, minutes, 500)),
    usg: ratingFrom('usg', shrink(raw.usg, 16, minutes, 300)),
    sta: ratingFrom('sta', Math.max(raw.mp, 12) + (raw.age < 30 ? 2 : raw.age > 33 ? -2 : 0)),
  };

  const personality = personalityFor(raw.id, raw);
  const now = ovr(ratings);
  const team = raw.team ?? 'FA';
  return {
    id: raw.id,
    name: raw.name,
    img: raw.id,
    pos: raw.pos,
    age: raw.age,
    ratings,
    pot: potential(now, raw.age, personality.work),
    personality,
    tend: {
      t3: clamp((fg3aTot + 0.3 * 20) / (raw.fga * raw.g + 20), 0, 0.9),
      ftr: raw.fta / fga,
    },
    realTeam: raw.team,
    expMin: raw.mp,
    morale: 75,
    injury: null,
    dur: Math.round(clamp(40 + 60 * Math.min(1, raw.g / seasonGames(season)) + hashUnit(raw.id, 9) * 10, 30, 99)),
    stats: emptyLine(season, team),
    playoffStats: emptyLine(season, team),
    history: [{
      season, team, real: true,
      g: raw.g, gs: raw.gs, min: raw.mp * raw.g, pts: raw.pts * raw.g, orb: raw.orb * raw.g, drb: raw.drb * raw.g,
      ast: raw.ast * raw.g, stl: raw.stl * raw.g, blk: raw.blk * raw.g, tov: raw.tov * raw.g, pf: raw.pf * raw.g,
      fgm: raw.fg * raw.g, fga: raw.fga * raw.g, tpm: raw.fg3 * raw.g, tpa: raw.fg3a * raw.g,
      ftm: raw.ft * raw.g, fta: raw.fta * raw.g, pm: 0,
    }],
    awards: [],
  };
}

// Simple age curve: young players improve, peak ~27, decline after ~31.
export function progress(p: Player): string | null {
  const age = p.age;
  const workBoost = (p.personality.work - 50) / 50; // -1..1
  let base = age <= 21 ? 4 : age <= 23 ? 3 : age <= 25 ? 1.8 : age <= 27 ? 0.6 : age <= 29 ? -0.3 : age <= 31 ? -1.2 : age <= 33 ? -2.4 : -3.8;
  base += workBoost * (age <= 27 ? 1.8 : 1.0);
  const before = ovr(p.ratings);
  const leap = gauss(0, 1.6);
  for (const k of RATING_KEYS) {
    // Athletic skills fall off faster with age than shooting and IQ.
    const athletic = k === 'sta' || k === 'blk' || k === 'stl' || k === 'orb' || k === 'drw' || k === 'ins';
    const skillish = k === 'tp' || k === 'ft' || k === 'pas' || k === 'oiq' || k === 'hnd';
    let d = base + leap + gauss(0, 1.5);
    if (base < 0 && athletic) d *= 1.4;
    if (base < 0 && skillish) d *= 0.6;
    if (k === 'usg') d *= 0.6;
    p.ratings[k] = Math.round(clamp(p.ratings[k] + d, 1, 99));
  }
  p.age += 1;
  const after = ovr(p.ratings);
  p.pot = Math.max(after, potential(after, p.age, p.personality.work));
  p.expMin = Math.max(5, Math.min(38, p.expMin + (after - before) * 0.8));
  // Leadership grows with experience; ego follows role.
  p.personality.lead = Math.round(clamp(p.personality.lead + (p.age <= 32 ? 2 : 1), 1, 99));
  const delta = after - before;
  if (delta >= 4) return `${p.name} made a big leap (+${delta} OVR)`;
  if (delta <= -4) return `${p.name} declined (${delta} OVR)`;
  return null;
}

const FIRST = ['Jalen', 'Marcus', 'Tyrese', 'Devin', 'Malik', 'Andre', 'Isaiah', 'Cameron', 'Jordan', 'Darius', 'Keegan', 'Amen', 'Cole', 'Luka', 'Nikola', 'Evan', 'Bryce', 'Trey', 'Kai', 'Elijah', 'Jaylen', 'Noah', 'Mason', 'Dante', 'Xavier', 'Tariq', 'Omari', 'Reed', 'Grant', 'Miles', 'Caleb', 'Zion', 'Jabari', 'Aaron', 'Victor', 'Ousmane', 'Alperen', 'Josh', 'Corey', 'Derrick'];
const LAST = ['Walker', 'Johnson', 'Green', 'Brooks', 'Carter', 'Holmes', 'Bridges', 'Mitchell', 'Allen', 'Harris', 'Porter', 'Daniels', 'Washington', 'Reid', 'Ellis', 'Murray', 'Sanders', 'Banks', 'Coleman', 'Hayes', 'Fields', 'Jovic', 'Petrovic', 'Diallo', 'Okafor', 'Barnes', 'Moore', 'Watson', 'Price', 'Henderson', 'Grimes', 'Sharpe', 'Thompson', 'Bates', 'Kessler', 'Wallace', 'Lively', 'Ivey', 'Cooper', 'Fleming'];
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// Fictional rookies for drafts after the first season.
export function generateRookie(season: number, n: number): Player {
  const pos = POSITIONS[Math.floor(random() * 5)];
  const posIdx = POSITIONS.indexOf(pos); // 0 guard .. 4 center
  const talent = gauss(0, 1) - n * 0.012; // earlier generated = slightly better on average
  const g = (mean: number, guardBias: number, sd = 9) => Math.round(clamp(mean + guardBias * (2 - posIdx) + talent * 8 + gauss(0, sd), 5, 90));
  const ratings: Ratings = {
    ins: g(42, -3), tp: g(38, 5), ft: g(45, 4), drw: g(35, -1), pas: g(32, 9), hnd: g(38, 2),
    oiq: g(28, 0, 7), orb: g(30, -8), drb: g(32, -7), stl: g(40, 3), blk: g(30, -9), def: g(34, 0, 7),
    usg: g(30, 2), sta: g(30, 0, 6),
  };
  const age = 19 + Math.floor(random() * 4);
  const id = `gen-${season}-${n}-${Math.floor(random() * 1e6)}`;
  const name = `${FIRST[Math.floor(random() * FIRST.length)]} ${LAST[Math.floor(random() * LAST.length)]}`;
  const personality = personalityFor(id, { age, usg: statFrom('usg', ratings.usg), astP: statFrom('pas', ratings.pas) });
  const now = ovr(ratings);
  const pot = Math.round(clamp(potential(now, age, personality.work) + talent * 4 + gauss(0, 4), now, 99));
  return {
    id, name, img: null, pos, age, ratings, pot, personality,
    tend: { t3: clamp(0.15 + (2 - posIdx) * 0.06 + (ratings.tp - 40) / 200, 0.02, 0.7), ftr: statFrom('drw', ratings.drw) },
    realTeam: null, expMin: 12, morale: 80, injury: null, dur: Math.round(60 + random() * 35),
    stats: emptyLine(season, 'FA'), playoffStats: emptyLine(season, 'FA'), history: [], awards: [], rookie: true,
  };
}
