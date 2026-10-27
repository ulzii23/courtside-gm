import type { BoxLine, BoxTeam, DefenseSystem, Focus, OffenseSystem, Player, Team } from '../types';
import { statFrom } from './ratings';
import { chance, pickWeighted, random } from './random';

// Possession-by-possession game simulation. Every probability comes from a player rating converted
// back to the real stat it was built from (see ratings.ts), then nudged by matchup, strategy,
// fatigue, morale, chemistry and clutch situations.

interface SimPlayer {
  p: Player;
  line: BoxLine;
  targetSec: number;
  secs: number;
  energy: number;
  fouls: number;
  techs: number;
  out: boolean; // fouled out, ejected or injured during the game
  // cached stat values
  p2: number; p3: number; pft: number; ftr: number; t3: number; ast: number; tov: number;
  orb: number; drb: number; stl: number; blk: number; dbpm: number; usg: number; staMin: number;
  prof: ShotProfile;
  shootMul: number; passMul: number; crashMul: number; tovMul: number; fatigueMul: number;
}

// ---------------------------------------------------------------- shot zones & offensive focus

export type Zone = 'rim' | 'post' | 'mid' | 'three';
export const ZONES: Zone[] = ['rim', 'post', 'mid', 'three'];
type ZoneMap = Record<Zone, number>;

const BIGNESS: Record<string, number> = { PG: 0.1, SG: 0.15, SF: 0.4, PF: 0.75, C: 1 };
// Free throw trips, blocks and assisted makes differ a lot by where the shot comes from.
const ZONE_FTR: ZoneMap = { rim: 1.7, post: 1.3, mid: 0.35, three: 0.12 };
const ZONE_BLK: ZoneMap = { rim: 1.15, post: 1.0, mid: 0.4, three: 0.12 };
const ZONE_AST: ZoneMap = { rim: 0.6, post: 0.38, mid: 0.5, three: 0.86 };
const LEVEL_MUL = [0.2, 0.5, 1, 1.8, 3];
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const focusMul = (lv?: number) => LEVEL_MUL[clamp(Math.round(lv ?? 0), -2, 2) + 2];

export interface ShotProfile {
  natural: ZoneMap; // share of shots from each zone when he plays his own game
  share: ZoneMap; // share with the GM's focus applied
  pct: ZoneMap; // make chance by zone (before defense, fatigue etc.)
  ftrNorm: number; // keeps his overall free throw rate equal to his rating on his natural mix
}

export function shotProfile(p: Player, focus: Focus | undefined = p.focus): ShotProfile {
  const r = p.ratings;
  const big = BIGNESS[p.pos] ?? 0.4;
  const drwN = (r.drw - 50) / 50;
  let rim = clamp(0.38 + 0.12 * big + 0.1 * drwN, 0.2, 0.65);
  let post = clamp(0.06 + 0.22 * big, 0.04, 0.32);
  let mid = Math.max(0.1, 1 - rim - post);
  const sum2 = rim + post + mid;
  rim /= sum2; post /= sum2; mid /= sum2;
  const t3 = p.tend.t3;
  const natural: ZoneMap = { rim: (1 - t3) * rim, post: (1 - t3) * post, mid: (1 - t3) * mid, three: t3 };

  // Zone offsets around his real 2P%, chosen so his natural mix reproduces it exactly.
  const p2 = statFrom('ins', r.ins);
  const off = { rim: 0.14 + 0.02 * big, post: -0.02 + 0.03 * ((r.ins - 50) / 50), mid: -0.09 + 0.04 * ((r.ft - 50) / 50) };
  const mean = rim * off.rim + post * off.post + mid * off.mid;
  const pct: ZoneMap = {
    rim: p2 - mean + off.rim, post: p2 - mean + off.post, mid: p2 - mean + off.mid, three: statFrom('tp', r.tp),
  };

  // Focus: scale each zone; "more" also guarantees some volume for shots he rarely takes.
  const w = {} as ZoneMap;
  for (const z of ZONES) {
    const m = focusMul(focus?.[z]);
    w[z] = natural[z] * m + (m > 1 ? (m - 1) * 0.06 : 0);
  }
  const tot = ZONES.reduce((a, z) => a + w[z], 0);
  const share = {} as ZoneMap;
  for (const z of ZONES) {
    share[z] = w[z] / tot;
    // Forcing shots he isn't used to taking costs efficiency.
    const forced = share[z] / Math.max(0.01, natural[z]);
    if (forced > 1) pct[z] -= Math.min(0.08, 0.025 * Math.log2(forced));
  }
  const ftrNorm = ZONES.reduce((a, z) => a + natural[z] * ZONE_FTR[z], 0);
  return { natural, share, pct, ftrNorm };
}

interface SimTeam {
  team: Team;
  players: SimPlayer[];
  onCourt: SimPlayer[];
  score: number;
  quarters: number[];
  home: boolean;
  closer: SimPlayer | null;
  chemMod: number;
}

export interface SimOutcome {
  home: BoxTeam;
  away: BoxTeam;
  ot: number;
  notes: string[];
  injuries: { id: string; type: string; games: number }[];
}

const GUARDS = new Set(['PG', 'SG']);
const BIGS = new Set(['PF', 'C']);

const INJURIES: [string, number, number, number][] = [
  // type, min games, max games, weight
  ['Ankle sprain', 1, 6, 30], ['Knee soreness', 1, 4, 20], ['Hamstring strain', 3, 12, 14],
  ['Back spasms', 1, 5, 12], ['Concussion', 2, 8, 6], ['Broken hand', 12, 30, 4],
  ['Torn meniscus', 15, 40, 3], ['Achilles tear', 60, 82, 0.6], ['Torn ACL', 60, 82, 0.6],
  ['Calf strain', 2, 10, 10],
];

function makeSimPlayer(p: Player, targetMin: number, starter: boolean): SimPlayer {
  const r = p.ratings;
  return {
    p,
    line: {
      id: p.id, name: p.name, pos: p.pos, starter,
      min: 0, pts: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
      fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pm: 0,
    },
    targetSec: targetMin * 60,
    secs: 0,
    energy: 1,
    fouls: 0,
    techs: 0,
    out: false,
    p2: statFrom('ins', r.ins),
    p3: statFrom('tp', r.tp),
    pft: Math.min(0.97, statFrom('ft', r.ft)),
    ftr: Math.max(0.02, statFrom('drw', r.drw)),
    t3: p.tend.t3,
    ast: Math.max(1, statFrom('pas', r.pas)),
    tov: Math.max(3, statFrom('hnd', r.hnd)),
    orb: Math.max(0.3, statFrom('orb', r.orb)),
    drb: Math.max(3, statFrom('drb', r.drb)),
    stl: Math.max(0.2, statFrom('stl', r.stl)),
    blk: Math.max(0.05, statFrom('blk', r.blk)),
    dbpm: statFrom('def', r.def),
    usg: Math.max(6, statFrom('usg', r.usg)),
    staMin: Math.max(10, statFrom('sta', r.sta)),
    prof: shotProfile(p),
    shootMul: Math.sqrt(focusMul(p.focus?.shoot)) / Math.pow(focusMul(p.focus?.pass), 0.35),
    passMul: focusMul(p.focus?.pass),
    crashMul: Math.pow(focusMul(p.focus?.crash), 0.5),
    tovMul: 1 + clamp(p.focus?.pass ?? 0, 0, 2) * 0.05,
    fatigueMul: 1 + clamp(p.focus?.crash ?? 0, 0, 2) * 0.05,
  };
}

const pickOne = <T,>(xs: T[]): T => xs[Math.floor(random() * xs.length)];
const share = <T,>(xs: T[], x: T) => xs.filter((y) => y === x).length / Math.max(1, xs.length);

const OFFENSE_PACE: Partial<Record<OffenseSystem, number>> = { 'run-gun': 6, 'pace-space': 2, 'inside-out': -2, 'post-up': -3, iso: -2 };
const DEFENSE_PACE: Partial<Record<DefenseSystem, number>> = { press: 4 };

export function simulateGame(
  homeTeam: Team,
  awayTeam: Team,
  players: Record<string, Player>,
  leaguePace: number,
  defMean: number,
  opts: { playoff?: boolean } = {},
): SimOutcome {
  const notes: string[] = [];
  const injuries: SimOutcome['injuries'] = [];

  const build = (team: Team, home: boolean): SimTeam => {
    const sps: SimPlayer[] = [];
    team.roster.forEach((id, i) => {
      const p = players[id];
      if (!p || p.injury) return;
      // Playoff rotations tighten: starters play more, deep bench less.
      let target = team.minutes[id] ?? 0;
      if (opts.playoff) target = i < 5 ? target * 1.08 : i < 8 ? target : target * 0.5;
      sps.push(makeSimPlayer(p, target, i < 5));
    });
    // Re-normalize target minutes to 240 among healthy players.
    const total = sps.reduce((s, x) => s + x.targetSec, 0);
    if (total > 0) for (const x of sps) x.targetSec = (x.targetSec / total) * 240 * 60;
    else for (const x of sps.slice(0, 9)) x.targetSec = (240 / Math.min(9, sps.length)) * 60;
    const closerId = team.strategy.closer;
    const closer = sps.find((x) => x.p.id === closerId) ?? [...sps].sort((a, b) => b.usg - a.usg)[0] ?? null;
    return {
      team, players: sps, onCourt: [], score: 0, quarters: [], home, closer,
      chemMod: ((team.chem - 60) / 40) * 0.01,
    };
  };

  const H = build(homeTeam, true);
  const A = build(awayTeam, false);

  const avgOf = <T extends string>(xs: T[], table: Partial<Record<T, number>>) =>
    xs.reduce((s, x) => s + (table[x] ?? 0), 0) / Math.max(1, xs.length);
  const paceAdj = (t: Team) =>
    (t.strategy.pace === 'fast' ? 4 : t.strategy.pace === 'slow' ? -4 : 0) +
    avgOf(t.strategy.offense, OFFENSE_PACE) + avgOf(t.strategy.defense, DEFENSE_PACE);
  const pace = Math.max(80, leaguePace + (paceAdj(homeTeam) + paceAdj(awayTeam)) / 2);
  const avgPossSec = 2880 / (2 * pace);

  let period = 0;
  let clock = 0;
  let sinceSub = 999;

  const elapsedRegulation = () => Math.min(2880, period * 720 + (720 - clock));

  function chooseLineup(t: SimTeam, other: SimTeam, forceStarters: boolean) {
    const avail = t.players.filter((x) => !x.out);
    if (avail.length <= 5) {
      t.onCourt = avail;
      return;
    }
    const isOT = period >= 4;
    const margin = t.score - other.score;
    const remaining = isOT ? clock : 2880 - elapsedRegulation();
    const garbage = period === 3 && clock < 360 && Math.abs(margin) >= 20;
    const foulLimit = isOT ? 6 : period === 0 ? 2 : period === 1 ? 3 : period === 2 ? 4 : 5;
    const lateClose = (period >= 3 && clock < 300 && Math.abs(margin) <= 10) || isOT;

    const score = (x: SimPlayer) => {
      if (forceStarters && !isOT) return (x.line.starter ? 1000 : 0) + x.targetSec / 60;
      if (garbage) return -x.targetSec / 60 + x.energy * 4;
      const frac = Math.min(1, (elapsedRegulation() + 150) / 2880);
      let need = (x.targetSec * frac - x.secs) / 60; // minutes behind schedule
      need += (x.energy - 0.75) * 14;
      if (lateClose) need = x.targetSec / 60 + x.energy * 10; // best players close games
      if (x.fouls >= foulLimit && !(lateClose && x.fouls < 6)) need -= 40;
      if (x.targetSec === 0) need -= remaining < 60 ? 20 : 60;
      return need;
    };
    const ranked = [...avail].sort((a, b) => score(b) - score(a));
    const five = ranked.slice(0, 5);
    // Keep at least one guard and one big on the floor when possible.
    const fix = (set: Set<string>) => {
      if (five.some((x) => set.has(x.p.pos))) return;
      // Only bring in a fresh player who isn't already well past his minutes.
      const frac = Math.min(1, (elapsedRegulation() + 150) / 2880);
      const sub = ranked.slice(5).find((x) => set.has(x.p.pos) && x.targetSec > 0 && x.energy > 0.6 && x.secs < x.targetSec * frac + 180);
      if (!sub) return;
      let worstIdx = -1;
      for (let i = 4; i >= 0; i--) {
        const c = five[i];
        const otherGroup = set === GUARDS ? BIGS : GUARDS;
        if (!otherGroup.has(c.p.pos) || five.filter((y) => otherGroup.has(y.p.pos)).length > 1) { worstIdx = i; break; }
      }
      if (worstIdx >= 0) five[worstIdx] = sub;
    };
    if (!forceStarters) {
      fix(GUARDS);
      fix(BIGS);
    }
    t.onCourt = five;
  }


  function tick(secs: number) {
    for (const t of [H, A]) {
      const st = t.team.strategy;
      const fatigueRate = (1 + 0.2 * share(st.defense, 'press')) * (1 + 0.12 * share(st.offense, 'run-gun'));
      for (const x of t.players) {
        if (t.onCourt.includes(x)) {
          x.secs += secs;
          x.energy = Math.max(0.3, x.energy - secs * fatigueRate * x.fatigueMul * (0.00105 * 30 / x.staMin));
        } else {
          x.energy = Math.min(1, x.energy + secs * 0.0016);
        }
      }
    }
  }

  function addPoints(t: SimTeam, o: SimTeam, pts: number) {
    t.score += pts;
    t.quarters[period] = (t.quarters[period] ?? 0) + pts;
    for (const x of t.onCourt) x.line.pm += pts;
    for (const x of o.onCourt) x.line.pm -= pts;
  }

  function foul(def: SimTeam, off: SimTeam) {
    const fouler = pickWeighted(def.onCourt, (x) => 20 + x.p.personality.temper * 0.3 + x.blk * 3);
    fouler.fouls++;
    fouler.line.pf++;
    if (fouler.fouls >= 6) {
      fouler.out = true;
      notes.push(`${fouler.p.name} fouled out.`);
      chooseLineup(def, off, false);
    }
  }

  function freeThrows(off: SimTeam, def: SimTeam, shooter: SimPlayer, n: number): boolean {
    let lastMiss = false;
    for (let i = 0; i < n; i++) {
      shooter.line.fta++;
      const clutchPressure = isClutch(off, def) ? ((shooter.p.personality.clutch - 50) / 50) * 0.04 : 0;
      if (chance(Math.min(0.98, shooter.pft + clutchPressure))) {
        shooter.line.ftm++;
        shooter.line.pts++;
        addPoints(off, def, 1);
        lastMiss = false;
      } else lastMiss = true;
    }
    return lastMiss;
  }

  const isClutch = (a: SimTeam, b: SimTeam) => period >= 3 && clock <= 150 && Math.abs(a.score - b.score) <= 6;

  // Returns true if the offense keeps the ball (offensive rebound).
  function rebound(off: SimTeam, def: SimTeam, mods: { orb: number }): boolean {
    const orbSum = off.onCourt.reduce((s, x) => s + x.orb * x.crashMul, 0) * mods.orb;
    const drbSum = def.onCourt.reduce((s, x) => s + x.drb, 0);
    if (random() < orbSum / (orbSum + drbSum)) {
      const r = pickWeighted(off.onCourt, (x) => x.orb * x.crashMul);
      r.line.orb++;
      return true;
    }
    const r = pickWeighted(def.onCourt, (x) => x.drb);
    r.line.drb++;
    return false;
  }

  function possession(off: SimTeam, def: SimTeam): number {
    // Teams that mix systems pick one each trip down the floor.
    const os = pickOne(off.team.strategy.offense);
    const ds = pickOne(def.team.strategy.defense);
    let elapsed = avgPossSec * (0.55 + random() * 0.9);

    // Strategy modifiers: zm scales how often each zone is shot, za adds to its make chance.
    const zm: ZoneMap = { rim: 1, post: 1, mid: 1, three: 1 };
    const za: ZoneMap = { rim: 0, post: 0, mid: 0, three: 0 };
    let tovMul = 1, orbMul = 1, astAdd = 0, ftrMul = 1;
    const avgOnCourt = (f: (x: SimPlayer) => number) => off.onCourt.reduce((s, x) => s + f(x), 0) / off.onCourt.length;
    const all2 = (v: number) => { za.rim += v; za.post += v; za.mid += v; };
    switch (os) {
      case 'pace-space': {
        zm.three *= 1.25;
        za.three += ((avgOnCourt((x) => x.p.ratings.tp) - 50) / 25) * 0.01;
        break;
      }
      case 'inside-out': zm.three *= 0.8; zm.post *= 1.25; zm.rim *= 1.1; ftrMul *= 1.15; orbMul *= 1.12; all2(0.008); break;
      case 'motion': astAdd += 0.08; tovMul *= 0.92; all2(((avgOnCourt((x) => x.p.ratings.pas) - 45) / 25) * 0.008); break;
      case 'run-gun': tovMul *= 1.08; zm.rim *= 1.2; za.rim += 0.012; all2(0.004); break;
      case 'heliocentric': za.three += 0.004; break;
      case 'pick-roll': {
        zm.rim *= 1.12; zm.mid *= 1.12; astAdd += 0.04;
        const fit = ((Math.max(...off.onCourt.map((x) => x.p.ratings.pas)) - 50) / 25) * 0.01;
        za.rim += 0.006 + fit; za.mid += 0.004 + fit / 2;
        break;
      }
      case 'post-up': zm.post *= 1.6; zm.three *= 0.9; za.post += 0.012; ftrMul *= 1.08; orbMul *= 1.05; break;
      case 'iso': zm.mid *= 1.3; astAdd -= 0.15; tovMul *= 0.94; break;
    }
    const defOnCourt = def.onCourt;
    const avgDef = defOnCourt.reduce((s, x) => s + x.dbpm, 0) / defOnCourt.length;
    const defFit = (avgDef - defMean) / 2; // ~ -1..1
    switch (ds) {
      case 'switch': za.three -= 0.012 * Math.max(0, defFit + 0.5); all2(-0.006 * defFit); orbMul *= 1.08; break;
      case 'drop': za.rim -= 0.03; za.post -= 0.015; za.mid += 0.012; zm.mid *= 1.1; zm.three *= 1.1; za.three += 0.008; break;
      case 'zone': zm.three *= 1.2; za.rim -= 0.02; za.post -= 0.02; orbMul *= 1.15; tovMul *= 1.03; break;
      case 'press': tovMul *= 1.15; za.rim += 0.02; all2(0.005); break;
    }
    // Spacing: a lineup that has stopped shooting threes lets the defense pack the paint.
    const spacing = clamp(avgOnCourt((x) => x.prof.natural.three - x.prof.share.three) * 0.12, -0.01, 0.025);
    za.rim -= spacing; za.post -= spacing;
    // Defenders on the floor vs league average: each point of team DBPM ~ 1.5% FG.
    const defAdj = -(avgDef - defMean) * 0.015;
    const stlSum = defOnCourt.reduce((s, x) => s + x.stl, 0);
    const blkSum = defOnCourt.reduce((s, x) => s + x.blk, 0);
    const homeAdd = off.home && !opts.playoff ? 0.008 : off.home ? 0.006 : 0;
    const clutch = isClutch(off, def);

    // Pick the player who ends the possession.
    const shooter = pickWeighted(off.onCourt, (x) => {
      let w = x.usg;
      if (os === 'motion') w = Math.pow(x.usg, 0.6) * 4;
      if (os === 'iso') w = Math.pow(x.usg, 1.5) / 5;
      if (os === 'post-up' && BIGS.has(x.p.pos)) w *= 1.4;
      if (x === off.closer && (os === 'heliocentric' || clutch)) w *= clutch ? 2.5 : 1.8;
      return w * x.shootMul * (0.7 + 0.3 * x.energy);
    });
    const perf = (0.93 + 0.07 * shooter.energy) + ((shooter.p.morale - 60) / 40) * 0.008 + off.chemMod;
    const clutchAdd = clutch ? ((shooter.p.personality.clutch - 50) / 50) * 0.035 : 0;

    // Rare technical fouls for hot-headed players.
    if (chance(Math.pow(shooter.p.personality.temper / 100, 4) * 0.004)) {
      shooter.techs++;
      notes.push(`${shooter.p.name} was hit with a technical foul.`);
      const ftShooter = [...def.onCourt].sort((a, b) => b.pft - a.pft)[0];
      freeThrows(def, off, ftShooter, 1);
      if (shooter.techs >= 2) {
        shooter.out = true;
        notes.push(`${shooter.p.name} was ejected!`);
        chooseLineup(off, def, false);
        return elapsed;
      }
    }

    // Turnover
    const tovP = (shooter.tov / 100) * tovMul * shooter.tovMul * (1 + (stlSum - 8) / 16) * (1.15 - 0.15 * shooter.energy);
    if (chance(tovP)) {
      shooter.line.tov++;
      if (chance(Math.min(0.85, stlSum / 100 / 0.135))) {
        pickWeighted(defOnCourt, (x) => x.stl).line.stl++;
        elapsed *= 0.6;
      }
      return elapsed;
    }

    // Non-shooting foul that just resets the possession (counts toward foul trouble).
    if (chance(0.06)) foul(def, off);

    // Where the shot comes from.
    const zone = pickWeighted(ZONES, (z) => shooter.prof.share[z] * zm[z]);
    const three = zone === 'three';

    // Shooting foul trip
    const ftr = (shooter.ftr * ftrMul * ZONE_FTR[zone]) / shooter.prof.ftrNorm;
    if (chance((0.44 * ftr) / (1 + 0.44 * ftr))) {
      foul(def, off);
      const missedLast = freeThrows(off, def, shooter, three ? 3 : 2);
      if (missedLast && rebound(off, def, { orb: orbMul * 0.5 })) return elapsed + possessionContinue(off, def);
      return elapsed;
    }

    shooter.line.fga++;
    if (three) shooter.line.tpa++;
    let make = shooter.prof.pct[zone] + za[zone] + defAdj * (three ? 0.8 : 1) + homeAdd + clutchAdd;
    make = make * perf;

    const blkRate = (blkSum / 100) * ZONE_BLK[zone];
    const blocked = chance(blkRate);
    if (!blocked) make = make / (1 - blkRate);
    if (!blocked && chance(Math.max(0.05, Math.min(0.9, make)))) {
      const pts = three ? 3 : 2;
      shooter.line.fgm++;
      if (three) shooter.line.tpm++;
      shooter.line.pts += pts;
      addPoints(off, def, pts);
      // Assist
      const creatorAdj = 1 - Math.max(0, (shooter.usg - 20) / 60);
      if (chance((ZONE_AST[zone] + astAdd) * creatorAdj)) {
        const mates = off.onCourt.filter((x) => x !== shooter);
        if (mates.length) pickWeighted(mates, (x) => Math.pow(x.ast, 1.6) * x.passMul).line.ast++;
      }
      // And-one
      if (!three && chance(0.055 * (shooter.ftr / 0.3) * (ZONE_FTR[zone] / 1.2))) {
        foul(def, off);
        freeThrows(off, def, shooter, 1);
      }
      return elapsed;
    }
    if (blocked) pickWeighted(defOnCourt, (x) => x.blk).line.blk++;
    if (rebound(off, def, { orb: orbMul })) return elapsed + possessionContinue(off, def);
    return elapsed;
  }

  // Offensive rebound: a short extra trip for the same team.
  function possessionContinue(off: SimTeam, def: SimTeam): number {
    return 3 + possession(off, def) * 0.5;
  }

  function maybeInjure(t: SimTeam, other: SimTeam) {
    for (const x of t.onCourt) {
      const risk = (1.25 - x.p.dur / 100) * 0.00011 * (1.3 - x.energy * 0.3);
      if (chance(risk)) {
        const [type, lo, hi] = pickWeighted(INJURIES, (i) => i[3]);
        const games = lo + Math.floor(random() * (hi - lo + 1));
        injuries.push({ id: x.p.id, type, games });
        notes.push(`${x.p.name} left the game with a ${type.toLowerCase()} (out ~${games} games).`);
        x.out = true;
        chooseLineup(t, other, false);
        return;
      }
    }
  }

  let offense = random() < 0.5 ? H : A;
  const periods = () => (period < 4 ? 720 : 300);
  for (period = 0; ; period++) {
    clock = periods();
    if (period === 0 || period === 2 || period >= 4) {
      chooseLineup(H, A, period < 4);
      chooseLineup(A, H, period < 4);
    }
    if (period === 2) offense = offense === H ? A : H;
    sinceSub = 0;
    H.quarters[period] = H.quarters[period] ?? 0;
    A.quarters[period] = A.quarters[period] ?? 0;
    while (clock > 0) {
      const def = offense === H ? A : H;
      const used = Math.min(clock, possession(offense, def));
      clock -= used;
      sinceSub += used;
      tick(used);
      if (sinceSub >= 100 || clock <= 0) {
        maybeInjure(H, A);
        maybeInjure(A, H);
        chooseLineup(H, A, false);
        chooseLineup(A, H, false);
        sinceSub = 0;
      }
      offense = def;
    }
    if (period >= 3 && H.score !== A.score) break;
    if (period >= 12) {
      // Absurdly long game guard: award it to the home team.
      H.score++;
      H.quarters[period]++;
      break;
    }
  }

  const toBox = (t: SimTeam): BoxTeam => {
    const lines = t.players.map((x) => ({ ...x.line, min: Math.round((x.secs / 60) * 10) / 10 }));
    for (const l of lines) if (l.min === 0) l.dnp = "Coach's decision";
    for (const id of t.team.roster) {
      const p = players[id];
      if (p?.injury) lines.push({
        id: p.id, name: p.name, pos: p.pos, starter: false, min: 0, pts: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0,
        tov: 0, pf: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, pm: 0, dnp: `Injured (${p.injury.type})`,
      });
    }
    return { abbr: t.team.abbr, score: t.score, quarters: t.quarters, lines };
  };
  return { home: toBox(H), away: toBox(A), ot: Math.max(0, period - 3), notes, injuries };
}
