import type { BoxLine, League, Player, RatingKey, SeasonLine } from '../types';
import { addNews } from './league';
import { ovr, potential } from './ratings';
import { gauss, random } from './random';

// Ratings move during the season, not just in the offseason:
// - form: confidence from recent games (hot / cold streaks), affects in-game performance
// - rust: sharpness lost sitting on the bench or out injured, worn off by playing
// - monthly development: opportunity + form + work ethic grow a player; benching and unhappiness erode him
// - serious injuries leave lasting damage to athletic ratings and durability

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

type GameLine = Pick<BoxLine, 'pts' | 'fgm' | 'fga' | 'ftm' | 'fta' | 'orb' | 'drb' | 'stl' | 'ast' | 'blk' | 'pf' | 'tov'>;
// Hollinger game score.
const gameScore = (l: GameLine) =>
  l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.orb + 0.3 * l.drb + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;
const per36 = (s: SeasonLine) => (s.min > 0 ? (gameScore(s) / s.min) * 36 : 0);

// What a normal game looks like for him: this season once there's a sample, else his last season.
function baseline36(p: Player) {
  if (p.stats.g >= 10) return per36(p.stats);
  const last = p.history[p.history.length - 1];
  return last && last.min > 0 ? per36(last) : 10;
}

// After every game he was available for.
export function afterGame(p: Player, l: BoxLine | undefined) {
  const min = l?.min ?? 0;
  if (l && min >= 8) {
    const z = clamp((((gameScore(l) / min) * 36) - baseline36(p)) / 10, -1, 1);
    p.form = clamp((p.form ?? 0) * 0.8 + z * 0.2, -1, 1);
  } else {
    p.form = (p.form ?? 0) * 0.95;
  }
  if (min >= 10) p.rust = (p.rust ?? 0) * 0.75;
  else if (min === 0) p.rust = Math.min(0.6, (p.rust ?? 0) + 0.03);
  if ((p.rust ?? 0) < 0.02) p.rust = 0;
}

// ---------------------------------------------------------------- injuries

// Lasting damage: [min, max] rating points lost, and which ratings take it.
const ATHLETIC: RatingKey[] = ['sta', 'ins', 'drw', 'blk', 'stl', 'orb', 'drb', 'def'];
const LASTING: Record<string, { hit: [number, number]; keys: RatingKey[] }> = {
  'Achilles tear': { hit: [6, 12], keys: ATHLETIC },
  'Torn ACL': { hit: [4, 9], keys: ATHLETIC },
  'Torn meniscus': { hit: [1, 4], keys: ATHLETIC },
  'Broken hand': { hit: [0, 2], keys: ['tp', 'ft', 'hnd'] },
};

export function onInjury(league: League, p: Player, type: string, games: number) {
  p.injury = { type, games, total: games };
  const lasting = LASTING[type];
  if (!lasting) return;
  const before = ovr(p.ratings);
  const [lo, hi] = lasting.hit;
  const sev = lo + random() * (hi - lo);
  const youth = p.age <= 25 ? 0.7 : p.age >= 31 ? 1.3 : 1;
  for (const k of lasting.keys) p.ratings[k] = Math.round(clamp(p.ratings[k] - sev * youth * (0.6 + random() * 0.8), 1, 99));
  p.dur = Math.round(clamp(p.dur - sev * 1.2, 10, 99));
  p.seasonDelta = (p.seasonDelta ?? 0) + ovr(p.ratings) - before;
  if (sev >= 4) addNews(league, `🩺 Doctors fear ${p.name}'s ${type.toLowerCase()} will cost him some of his athleticism.`, { pid: p.id, team: p.stats.team });
}

// When he's cleared to play: rust in proportion to how long he was out.
export function onReturn(p: Player) {
  const total = p.injury?.total ?? 0;
  p.rust = Math.max(p.rust ?? 0, clamp(total / 25, 0.1, 0.8));
}

// ---------------------------------------------------------------- monthly development

// Ratings that respond to confidence and reps (not raw athleticism, which follows age).
const SKILL: RatingKey[] = ['oiq', 'def', 'ins', 'tp', 'ft', 'pas', 'hnd', 'drw', 'usg'];
const stochasticRound = (x: number) => Math.floor(x + random());

export function monthlyDevelopment(league: League) {
  for (const t of Object.values(league.teams)) {
    // A roster's expectations add up to more than 240 minutes, so judge each player against his share.
    const expTotal = t.roster.reduce((sum, id) => sum + (league.players[id]?.expMin ?? 0), 0);
    const scale = expTotal > 240 ? 240 / expTotal : 1;
    for (const id of t.roster) {
      const p = league.players[id];
      if (!p || p.stats.g < 5) continue;
      const mpg = p.stats.min / p.stats.g;
      // Opportunity: minutes beyond his fair share grow him; being buried erodes him.
      const opp = clamp((mpg - p.expMin * scale) / 12, -1, 1.2);
      const form = p.form ?? 0;
      const youth = p.age <= 22 ? 1.5 : p.age <= 25 ? 1.15 : p.age <= 29 ? 0.75 : 0.45;
      const work = 0.6 + p.personality.work / 100;
      let drift = youth * work * (0.5 * opp + 0.6 * form) * 0.6;
      // Unhappy players stop putting in the work.
      if (p.morale < 35) drift -= ((35 - p.morale) / 35) * (1.4 - p.personality.work / 100);
      if (Math.abs(drift) < 0.05) continue;

      const before = ovr(p.ratings);
      for (const k of SKILL) {
        const d = drift * 1.3 * (0.5 + random()) + gauss(0, 0.3);
        p.ratings[k] = clamp(p.ratings[k] + stochasticRound(d), 1, 99);
      }
      const after = ovr(p.ratings);
      const delta = after - before;
      p.seasonDelta = (p.seasonDelta ?? 0) + delta;
      if (after > p.pot) p.pot = after;
      else if (delta > 0 && p.age <= 25) p.pot = Math.max(p.pot, potential(after, p.age, p.personality.work));
      const mine = t.abbr === league.userTeam;
      if ((mine && Math.abs(delta) >= 2) || Math.abs(delta) >= 3) {
        const why = delta > 0
          ? opp > 0.3 ? 'thriving with the extra minutes' : 'playing with real confidence'
          : p.morale < 35 ? 'and his frustration is showing on the court' : opp < -0.3 ? 'and looks rusty buried on the bench' : 'and has lost his confidence';
        addNews(league, delta > 0
          ? `📈 ${p.name} (${t.abbr}) is ${why} (+${delta} OVR).`
          : `📉 ${p.name} (${t.abbr}) has slipped ${-delta} OVR ${why}.`, { pid: p.id, team: t.abbr });
      }
    }
  }
}

// Offseason growth also depends on the season he had: playing time and how it ended.
export function seasonFactor(p: Player): number {
  const mpg = p.stats.g ? p.stats.min / p.stats.g : 0;
  let f = 0;
  if (p.age <= 25) f += clamp((mpg - 16) / 18, -0.6, 1) * 1.2; // reps matter most for young players
  if (p.morale < 40) f -= 0.6;
  f += (p.form ?? 0) * 0.5;
  return f;
}

export function resetSeason(p: Player) {
  p.seasonDelta = 0;
  p.form = 0;
}
