import type { ReactNode } from 'react';
import { ovr, PERSONALITY_LABELS, RATING_LABELS, statFrom } from '../engine/ratings';
import { PERSONALITY_KEYS, type Player, type RatingKey } from '../types';
import { f1, Ovr, rColor } from './common';

// Column definitions for the draft room player table.

export const POS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'];
export type Mode = 'stats' | 'ratings' | 'personality';

export interface Col {
  key: string;
  label: string;
  title?: string;
  get: (p: Player) => number;
  show: (p: Player) => ReactNode;
}

const real = (p: Player) => p.history.find((h) => h.real);
// Real per-game stat from the season the league is based on.
function realCol(key: string, label: string, f: (r: NonNullable<ReturnType<typeof real>>) => number, title: string, pct = false): Col {
  const get = (p: Player) => {
    const r = real(p);
    return r ? f(r) : -1;
  };
  return {
    key, label, title, get,
    show: (p) => {
      const v = get(p);
      if (v < 0) return '—';
      return pct ? v.toFixed(3).replace(/^0/, '') : f1(v);
    },
  };
}
const per = (k: 'min' | 'pts' | 'ast' | 'stl' | 'blk' | 'tov' | 'tpm') => (r: NonNullable<ReturnType<typeof real>>) => r[k] / Math.max(1, r.g);

export const STAT_COLS: Col[] = [
  realCol('g', 'G', (r) => r.g, 'Games played'),
  realCol('min', 'MIN', per('min'), 'Minutes per game'),
  realCol('pts', 'PTS', per('pts'), 'Points per game'),
  realCol('reb', 'REB', (r) => (r.orb + r.drb) / Math.max(1, r.g), 'Rebounds per game'),
  realCol('ast', 'AST', per('ast'), 'Assists per game'),
  realCol('stl', 'STL', per('stl'), 'Steals per game'),
  realCol('blk', 'BLK', per('blk'), 'Blocks per game'),
  realCol('tov', 'TOV', per('tov'), 'Turnovers per game'),
  realCol('tpm', '3PM', per('tpm'), 'Threes made per game'),
  realCol('fgp', 'FG%', (r) => (r.fga ? r.fgm / r.fga : 0), 'Field goal %', true),
  realCol('tpp', '3P%', (r) => (r.tpa ? r.tpm / r.tpa : 0), 'Three point %', true),
  realCol('ftp', 'FT%', (r) => (r.fta ? r.ftm / r.fta : 0), 'Free throw %', true),
];

const SHORT: Record<RatingKey, string> = {
  ins: 'INS', tp: '3PT', ft: 'FT', drw: 'DRAW', pas: 'PASS', hnd: 'HNDL', oiq: 'OIQ', orb: 'OREB', drb: 'DREB',
  stl: 'STL', blk: 'BLK', def: 'DIQ', usg: 'CRT', sta: 'STAM',
};
const rated = (v: number) => <span className="rating-num" style={{ color: rColor(v) }}>{v}</span>;
export const RATING_COLS: Col[] = (Object.keys(SHORT) as RatingKey[]).map((k) => ({
  key: k, label: SHORT[k], title: RATING_LABELS[k] + (k === 'sta' ? ` (≈ minutes)` : ''),
  get: (p) => p.ratings[k],
  show: (p) => (k === 'sta' ? `${Math.round(statFrom('sta', p.ratings.sta))}m` : rated(p.ratings[k])),
}));

const PERS_SHORT: Record<string, string> = { lead: 'LDR', ego: 'EGO', work: 'WORK', clutch: 'CLUT', temper: 'TEMP', team: 'TEAM', loyal: 'LOYL' };
export const PERSONALITY_COLS: Col[] = PERSONALITY_KEYS.map((k) => ({
  key: k, label: PERS_SHORT[k], title: PERSONALITY_LABELS[k],
  get: (p) => p.personality[k] ?? 50,
  // For ego and temper, high is a warning sign rather than a strength.
  show: (p) => {
    const v = p.personality[k] ?? 50;
    return <span className="rating-num" style={{ color: rColor(k === 'ego' || k === 'temper' ? 100 - v : v) }}>{v}</span>;
  },
}));

export const BASE_COLS: Col[] = [
  { key: 'age', label: 'Age', get: (p) => p.age, show: (p) => p.age },
  { key: 'ovr', label: 'OVR', get: (p) => ovr(p.ratings), show: (p) => <Ovr p={p} /> },
  { key: 'pot', label: 'POT', get: (p) => p.pot, show: (p) => p.pot },
];

