import type {
  BoxLine, GameResult, League, Player, RawPlayer, ScheduledGame, SeasonLine, Series, Team,
} from '../types';
import { paceFor, teamsForSeason } from '../data/teams';
import { emptyLine, generateRookie, ovr, playerFromRaw, progress, statFrom } from './ratings';
import { makeSchedule } from './schedule';
import { aiDailyMoves } from './transactions';
import { simulateGame } from './sim';
import { chance, getSeed, random, seed, shuffle } from './random';

export const ROSTER_MAX = 15;
export const ROSTER_MIN = 8;
const DRAFT_ROUNDS = 13;

// ---------------------------------------------------------------- creation & fantasy draft

export function createLeague(season: number, raws: RawPlayer[], userTeam: string, rngSeed: number): League {
  seed(rngSeed);
  const players: Record<string, Player> = {};
  for (const raw of raws) {
    if (raw.g < 5 || raw.mp < 6) continue;
    const p = playerFromRaw(raw, season);
    players[p.id] = p;
  }
  const teams: Record<string, Team> = {};
  for (const info of teamsForSeason(season)) {
    teams[info.abbr] = {
      ...info, roster: [], minutes: {},
      strategy: { offense: 'balanced', defense: 'man', pace: 'normal', captain: null, closer: null },
      autoLineup: info.abbr !== userTeam,
      w: 0, l: 0, homeW: 0, homeL: 0, pf: 0, pa: 0, streak: 0, chem: 65,
    };
  }
  const defVals = Object.values(players).map((p) => statFrom('def', p.ratings.def));
  const order = shuffle(Object.keys(teams));
  const league: League = {
    version: 1,
    id: `lg-${Date.now().toString(36)}`,
    createdAt: Date.now(),
    baseSeason: season,
    season,
    phase: 'draft',
    userTeam,
    day: 0,
    teams,
    players,
    freeAgents: [],
    schedule: [],
    draft: {
      order: snakeOrder(order, DRAFT_ROUNDS),
      pick: 0,
      picks: [],
      pool: Object.values(players).sort((a, b) => ovr(b.ratings) - ovr(a.ratings)).map((p) => p.id),
      rookie: false,
      started: false,
      timer: 60,
      queue: [],
    },
    series: [],
    playoffDay: 0,
    champion: null,
    history: [],
    news: [],
    rngSeed: getSeed(),
    nextGameId: 0,
    trades: [],
    pace: paceFor(season),
    defMean: defVals.reduce((s, v) => s + v, 0) / defVals.length,
  };
  return league;
}

function snakeOrder(teams: string[], rounds: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < rounds; r++) out.push(...(r % 2 === 0 ? teams : [...teams].reverse()));
  return out;
}

// Before the fantasy draft starts: put the user in a given slot (1-30), or shuffle everyone (slot 0).
export function setDraftSlot(league: League, slot: number) {
  const d = league.draft!;
  const teams = Object.keys(league.teams);
  const rounds = Math.round(d.order.length / teams.length);
  const others = shuffle(teams.filter((t) => t !== league.userTeam));
  const first = slot >= 1 ? slot - 1 : Math.floor(random() * teams.length);
  others.splice(first, 0, league.userTeam);
  d.order = snakeOrder(others, rounds);
}

// The user's pick when they let the computer choose (or the clock runs out): queue first, then best available.
export function autoPickUser(league: League) {
  const d = league.draft!;
  const queued = d.queue?.find((id) => d.pool.includes(id));
  if (queued) makePick(league, queued);
  else aiPick(league);
}

const posGroup =(pos: string) => (pos === 'PG' || pos === 'SG' ? 'G' : pos === 'C' || pos === 'PF' ? 'B' : 'W');

// How much an AI team wants a player: current ability, upside for young players, roster fit.
export function draftValue(league: League, p: Player, team: Team): number {
  const now = ovr(p.ratings);
  let v = now;
  if (league.draft?.rookie) v = now * 0.5 + p.pot * 0.6;
  else {
    v += Math.max(0, p.pot - now) * 0.15;
    if (p.age >= 32) v -= (p.age - 31) * 0.8;
  }
  const counts = { G: 0, W: 0, B: 0 };
  for (const id of team.roster) counts[posGroup(league.players[id].pos) as 'G' | 'W' | 'B']++;
  const g = posGroup(p.pos) as 'G' | 'W' | 'B';
  const ideal = { G: 5, W: 4, B: 5 };
  if (counts[g] === 0 && team.roster.length >= 2) v += 6;
  if (counts[g] >= ideal[g]) v -= 3 * (counts[g] - ideal[g] + 1);
  return v + random() * 1.5;
}

export function currentPicker(league: League): string | null {
  const d = league.draft;
  if (!d || d.pick >= d.order.length) return null;
  return d.order[d.pick];
}

export function makePick(league: League, playerId: string) {
  const d = league.draft!;
  const team = league.teams[d.order[d.pick]];
  const p = league.players[playerId];
  team.roster.push(playerId);
  d.pool = d.pool.filter((id) => id !== playerId);
  if (d.queue) d.queue = d.queue.filter((id) => id !== playerId);
  d.picks.push({ pick: d.pick, team: team.abbr, player: playerId });
  if (d.rookie) {
    p.draft = { season: league.season, round: Math.floor(d.pick / 30) + 1, pick: (d.pick % 30) + 1, team: team.abbr };
    p.stats.team = team.abbr;
  }
  p.stats.team = team.abbr;
  p.playoffStats.team = team.abbr;
  d.pick++;
}

export function aiPick(league: League) {
  const d = league.draft!;
  const team = league.teams[d.order[d.pick]];
  // Only look at the best handful of available players to keep this fast.
  const candidates = d.pool.slice(0, 25).map((id) => league.players[id]);
  if (team.roster.length >= ROSTER_MAX) { d.pick++; return; }
  let best = candidates[0];
  let bestV = -Infinity;
  for (const p of candidates) {
    const v = draftValue(league, p, team);
    if (v > bestV) { bestV = v; best = p; }
  }
  if (best) makePick(league, best.id);
  else d.pick++;
}

// AI picks until it's the user's turn (or the draft ends).
export function simDraftToUser(league: League) {
  seed(league.rngSeed);
  while (league.draft && league.draft.pick < league.draft.order.length && currentPicker(league) !== league.userTeam) aiPick(league);
  league.rngSeed = getSeed();
}

export function autoDraftRest(league: League) {
  seed(league.rngSeed);
  while (league.draft && league.draft.pick < league.draft.order.length) aiPick(league);
  league.rngSeed = getSeed();
}

export function finishDraft(league: League) {
  const d = league.draft!;
  if (d.rookie) {
    league.freeAgents.push(...d.pool);
    for (const id of d.pool) league.players[id].stats.team = 'FA';
    league.draft = null;
    startRegularSeason(league);
    return;
  }
  league.freeAgents = [...d.pool];
  for (const id of d.pool) league.players[id].stats.team = 'FA';
  league.draft = null;
  for (const t of Object.values(league.teams)) {
    autoRotation(league, t, true);
  }
  startRegularSeason(league);
}

function startRegularSeason(league: League) {
  seed(league.rngSeed);
  const teams = Object.values(league.teams);
  for (const t of teams) {
    trimRoster(league, t);
    fillRoster(league, t);
    if (t.autoLineup) autoRotation(league, t, true);
    else sanitizeRotation(league, t);
    updateChemistry(league, t);
  }
  league.schedule = makeSchedule(teams);
  league.nextGameId = league.schedule.length;
  league.day = 0;
  league.phase = 'regular';
  league.series = [];
  league.playoffDay = 0;
  league.champion = null;
  league.rngSeed = getSeed();
  addNews(league, `The ${league.season - 1}-${String(league.season).slice(2)} season tips off!`);
}

// ---------------------------------------------------------------- rotations

const DEFAULT_MINUTES = [36, 35, 34, 33, 31, 23, 19, 15, 9, 5, 0, 0, 0, 0, 0];

export function autoRotation(league: League, team: Team, setStrategy: boolean) {
  const healthy = team.roster.map((id) => league.players[id]).filter((p) => !p.injury);
  const injured = team.roster.map((id) => league.players[id]).filter((p) => p.injury);
  const sorted = [...healthy].sort((a, b) => ovr(b.ratings) - ovr(a.ratings));
  // Starters: best five with at least one guard and one big.
  const starters: Player[] = [];
  const take = (pred: (p: Player) => boolean) => {
    const p = sorted.find((x) => pred(x) && !starters.includes(x));
    if (p) starters.push(p);
  };
  take((p) => posGroup(p.pos) === 'G');
  take((p) => posGroup(p.pos) === 'B');
  while (starters.length < 5 && starters.length < sorted.length) take(() => true);
  starters.sort((a, b) => ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(a.pos) - ['PG', 'SG', 'SF', 'PF', 'C'].indexOf(b.pos));
  const bench = sorted.filter((p) => !starters.includes(p));
  const order = [...starters, ...bench, ...injured];
  team.roster = order.map((p) => p.id);
  team.minutes = {};
  order.forEach((p, i) => {
    let m = p.injury ? 0 : DEFAULT_MINUTES[i] ?? 0;
    // Low-stamina players get a little less.
    if (m > 0) m = Math.min(m, statFrom('sta', p.ratings.sta) + 4);
    team.minutes[p.id] = m;
  });
  // Minutes lost to stamina caps go to the next players down the bench, not back to the starters.
  let deficit = 240 - order.reduce((s, p) => s + team.minutes[p.id], 0);
  for (let pass = 0; pass < 3 && deficit > 0; pass++) {
    for (const p of order.slice(5)) {
      if (deficit <= 0 || p.injury) continue;
      const cap = statFrom('sta', p.ratings.sta) + 4;
      const add = Math.min(deficit, Math.max(0, Math.min(cap, 24) - team.minutes[p.id]), 6);
      team.minutes[p.id] += add;
      deficit -= add;
    }
  }
  normalizeMinutes(team);
  if (setStrategy) {
    const top8 = order.slice(0, 8);
    team.strategy.captain = [...top8].sort((a, b) => b.personality.lead - a.personality.lead)[0]?.id ?? null;
    team.strategy.closer = [...top8].sort((a, b) => ovr(b.ratings) + b.ratings.usg * 0.3 - (ovr(a.ratings) + a.ratings.usg * 0.3))[0]?.id ?? null;
    team.strategy.offense = suggestOffense(top8);
    team.strategy.defense = suggestDefense(top8);
  }
}

function suggestOffense(top: Player[]): Team['strategy']['offense'] {
  if (!top.length) return 'balanced';
  const avg = (f: (p: Player) => number) => top.reduce((s, p) => s + f(p), 0) / top.length;
  const tp = avg((p) => p.ratings.tp);
  const ins = avg((p) => p.ratings.ins);
  const pas = avg((p) => p.ratings.pas);
  const star = Math.max(...top.map((p) => p.ratings.usg));
  if (star >= 88 && top.filter((p) => p.ratings.usg >= 80).length === 1) return 'heliocentric';
  if (tp >= 60) return 'pace-space';
  if (ins >= 62) return 'inside-out';
  if (pas >= 50) return 'motion';
  return 'balanced';
}

function suggestDefense(top: Player[]): Team['strategy']['defense'] {
  if (!top.length) return 'man';
  const bestBlk = Math.max(...top.map((p) => p.ratings.blk));
  const avgDef = top.reduce((s, p) => s + p.ratings.def, 0) / top.length;
  if (bestBlk >= 85) return 'drop';
  if (avgDef >= 55) return 'switch';
  return 'man';
}

export function normalizeMinutes(team: Team) {
  const total = Object.values(team.minutes).reduce((s, m) => s + m, 0);
  if (total <= 0) return;
  for (const id of Object.keys(team.minutes)) team.minutes[id] = Math.round((team.minutes[id] / total) * 240);
  // Fix rounding drift on the first starter.
  const drift = 240 - Object.values(team.minutes).reduce((s, m) => s + m, 0);
  const first = team.roster.find((id) => team.minutes[id] > 0);
  if (first) team.minutes[first] += drift;
}

// Make sure the rotation only references players on the roster.
export function sanitizeRotation(league: League, team: Team) {
  for (const id of Object.keys(team.minutes)) if (!team.roster.includes(id)) delete team.minutes[id];
  for (const id of team.roster) if (team.minutes[id] === undefined) team.minutes[id] = 0;
  if (team.strategy.captain && !team.roster.includes(team.strategy.captain)) team.strategy.captain = null;
  if (team.strategy.closer && !team.roster.includes(team.strategy.closer)) team.strategy.closer = null;
  if (Object.values(team.minutes).reduce((s, m) => s + m, 0) === 0) autoRotation(league, team, false);
}

function trimRoster(league: League, team: Team) {
  while (team.roster.length > ROSTER_MAX) {
    const worst = [...team.roster].sort((a, b) => ovr(league.players[a].ratings) - ovr(league.players[b].ratings))[0];
    releasePlayer(league, team.abbr, worst, team.abbr !== league.userTeam);
  }
}

function fillRoster(league: League, team: Team) {
  while (team.roster.length < 13 && league.freeAgents.length) {
    const best = [...league.freeAgents].sort((a, b) => ovr(league.players[b].ratings) - ovr(league.players[a].ratings))[0];
    signPlayer(league, team.abbr, best, true);
  }
}

export function signPlayer(league: League, abbr: string, id: string, quiet = false) {
  const team = league.teams[abbr];
  if (team.roster.length >= ROSTER_MAX) return false;
  league.freeAgents = league.freeAgents.filter((x) => x !== id);
  team.roster.push(id);
  team.minutes[id] = 0;
  const p = league.players[id];
  p.stats.team = abbr;
  p.playoffStats.team = abbr;
  p.morale = 70;
  if (!quiet) addNews(league, `${team.name} signed ${p.name}.`);
  return true;
}

export function releasePlayer(league: League, abbr: string, id: string, quiet = false) {
  const team = league.teams[abbr];
  team.roster = team.roster.filter((x) => x !== id);
  delete team.minutes[id];
  league.freeAgents.push(id);
  league.players[id].stats.team = 'FA';
  if (team.strategy.captain === id) team.strategy.captain = null;
  if (team.strategy.closer === id) team.strategy.closer = null;
  if (!quiet) addNews(league, `${team.name} released ${league.players[id].name}.`);
  if (!team.autoLineup) normalizeMinutes(team);
}

// ---------------------------------------------------------------- chemistry & morale

export function updateChemistry(league: League, team: Team) {
  const ps = team.roster.map((id) => league.players[id]);
  if (!ps.length) return;
  const rotation = ps.filter((p) => (team.minutes[p.id] ?? 0) >= 10);
  const core = rotation.length ? rotation : ps.slice(0, 8);
  const morale = core.reduce((s, p) => s + p.morale, 0) / core.length;
  const teamFirst = core.reduce((s, p) => s + p.personality.team, 0) / core.length;
  const captain = team.strategy.captain ? league.players[team.strategy.captain] : null;
  const lead = captain ? captain.personality.lead : 35;
  // Several big egos sharing the ball cause friction.
  const egos = core.filter((p) => p.personality.ego >= 75).length;
  const clash = Math.max(0, egos - 1) * 6;
  team.chem = Math.round(Math.max(5, Math.min(99, morale * 0.55 + lead * 0.25 + teamFirst * 0.2 - clash + 5)));
}

function updateMorale(league: League, team: Team, lines: BoxLine[], won: boolean) {
  const captain = team.strategy.captain ? league.players[team.strategy.captain] : null;
  const leadBoost = captain ? (captain.personality.lead - 50) / 100 : -0.2;
  for (const id of team.roster) {
    const p = league.players[id];
    if (p.injury) continue;
    const line = lines.find((l) => l.id === id);
    const min = line?.min ?? 0;
    const expected = p.expMin * (0.85 + p.personality.ego / 400);
    const egoW = 0.5 + p.personality.ego / 100;
    let d = 0;
    if (expected > 8) d += Math.max(-3, Math.min(1.5, ((min - expected) / expected) * 2.5)) * egoW;
    d += won ? 0.5 : -0.5 * (1 - p.personality.team / 200);
    if (team.streak <= -5) d -= 0.6;
    if (team.streak >= 5) d += 0.4;
    d += leadBoost * 0.6;
    // Loyal players shrug off bad stretches more easily.
    if (d < 0) d *= 1 - p.personality.loyal / 250;
    d += (70 - p.morale) * 0.03; // slow drift back to neutral
    const before = p.morale;
    p.morale = Math.max(0, Math.min(100, p.morale + d));
    if (team.abbr === league.userTeam && before >= 35 && p.morale < 35) {
      addNews(league, `${p.name} is unhappy with his role (${Math.round(min)} min last game, expects ~${Math.round(expected)}).`);
    }
    checkTradeRequest(league, team, p);
  }
}

// Unhappy, disloyal players eventually ask out; they take it back if things improve.
function checkTradeRequest(league: League, team: Team, p: Player) {
  if (!p.tradeRequest && p.expMin >= 15 && p.morale < 30 && p.personality.loyal < 55 && chance(0.06 * (1 - p.personality.loyal / 60))) {
    p.tradeRequest = true;
    addNews(league, `📢 ${p.name} has requested a trade from the ${team.name}.`);
  } else if (p.tradeRequest && p.morale > 60) {
    p.tradeRequest = false;
    addNews(league, `${p.name} has rescinded his trade request.`);
  }
}

// ---------------------------------------------------------------- playing games

function addLine(target: SeasonLine, l: BoxLine) {
  if (l.min <= 0) return;
  target.g++;
  if (l.starter) target.gs++;
  target.min += l.min; target.pts += l.pts; target.orb += l.orb; target.drb += l.drb; target.ast += l.ast;
  target.stl += l.stl; target.blk += l.blk; target.tov += l.tov; target.pf += l.pf;
  target.fgm += l.fgm; target.fga += l.fga; target.tpm += l.tpm; target.tpa += l.tpa;
  target.ftm += l.ftm; target.fta += l.fta; target.pm += l.pm;
}

function playGame(league: League, homeAbbr: string, awayAbbr: string, id: number, playoff?: string): GameResult {
  const home = league.teams[homeAbbr];
  const away = league.teams[awayAbbr];
  for (const t of [home, away]) {
    if (t.autoLineup) autoRotation(league, t, false);
    else sanitizeRotation(league, t);
  }
  const out = simulateGame(home, away, league.players, league.pace, league.defMean, { playoff: !!playoff });
  const result: GameResult = { id, day: league.day, home: out.home, away: out.away, ot: out.ot, playoff, notes: out.notes };

  const homeWon = out.home.score > out.away.score;
  for (const [t, box, won, isHome] of [[home, out.home, homeWon, true], [away, out.away, !homeWon, false]] as const) {
    for (const l of box.lines) {
      const p = league.players[l.id];
      if (!p) continue;
      addLine(playoff ? p.playoffStats : p.stats, l);
      if (l.pts >= 45) addNews(league, `${p.name} dropped ${l.pts} points vs ${isHome ? awayAbbr : homeAbbr}!`);
      else if (l.pts >= 10 && l.orb + l.drb >= 10 && l.ast >= 10) addNews(league, `${p.name} posted a triple-double (${l.pts}/${l.orb + l.drb}/${l.ast}).`);
    }
    // Injured players miss this game, which counts toward their recovery.
    for (const id of t.roster) {
      const p = league.players[id];
      if (p.injury && !box.lines.some((l) => l.id === id && l.min > 0)) {
        p.injury.games--;
        if (p.injury.games <= 0) {
          p.injury = null;
          if (t.abbr === league.userTeam) addNews(league, `${p.name} has returned from injury.`);
        }
      }
    }
    if (!playoff) {
      if (won) { t.w++; if (isHome) t.homeW++; } else { t.l++; if (isHome) t.homeL++; }
      t.streak = won ? Math.max(1, t.streak + 1) : Math.min(-1, t.streak - 1);
    }
    t.pf += box.score;
    t.pa += (isHome ? out.away : out.home).score;
    updateMorale(league, t, box.lines, won);
    updateChemistry(league, t);
  }
  for (const inj of out.injuries) {
    const p = league.players[inj.id];
    p.injury = { type: inj.type, games: inj.games };
    if (inj.games >= 10 || p.stats.team === league.userTeam) addNews(league, `${p.name} (${p.stats.team}) injured: ${inj.type}, out ~${inj.games} games.`);
  }
  return result;
}

// Sims one day. Returns the box scores it produced.
export function simDay(league: League): GameResult[] {
  seed(league.rngSeed);
  const results: GameResult[] = [];
  if (league.phase === 'regular') {
    const today = league.schedule.filter((g) => g.day === league.day && !g.played);
    for (const g of today) {
      const r = playGame(league, g.home, g.away, g.id);
      g.played = true;
      g.homeScore = r.home.score;
      g.awayScore = r.away.score;
      results.push(r);
    }
    league.day++;
    aiDailyMoves(league);
    if (league.schedule.every((g) => g.played)) endRegularSeason(league);
  } else if (league.phase === 'playoffs') {
    results.push(...playoffDay(league));
    league.day++;
  }
  league.rngSeed = getSeed();
  return results;
}

export function userNextGame(league: League): ScheduledGame | undefined {
  return league.schedule.find((g) => !g.played && (g.home === league.userTeam || g.away === league.userTeam));
}

// ---------------------------------------------------------------- standings & playoffs

export function standings(league: League, conf?: 'East' | 'West'): Team[] {
  return Object.values(league.teams)
    .filter((t) => !conf || t.conf === conf)
    .sort((a, b) => {
      const pa = a.w / Math.max(1, a.w + a.l), pb = b.w / Math.max(1, b.w + b.l);
      if (pb !== pa) return pb - pa;
      return (b.pf - b.pa) - (a.pf - a.pa);
    });
}

function endRegularSeason(league: League) {
  giveRegularSeasonAwards(league);
  league.phase = 'playoffs';
  const playIn = league.baseSeason >= 2021 || league.season >= 2021;
  for (const conf of ['East', 'West'] as const) {
    const s = standings(league, conf);
    if (playIn) {
      league.series.push(newSeries(conf, 0, 'Play-In (7 vs 8)', s[6].abbr, s[7].abbr, 7, 8, 1, 0));
      league.series.push(newSeries(conf, 0, 'Play-In (9 vs 10)', s[8].abbr, s[9].abbr, 9, 10, 1, 1));
    } else {
      startRound1(league, conf, s.slice(0, 8).map((t) => t.abbr));
    }
  }
  addNews(league, 'The regular season is over. Playoffs begin!');
}

function newSeries(conf: Series['conf'], round: number, label: string, high: string, low: string, highSeed: number, lowSeed: number, bestOf: number, slot: number): Series {
  return {
    id: `${conf}-${round}-${slot}`, round, label, conf, high, low, highSeed, lowSeed,
    winsHigh: 0, winsLow: 0, bestOf, games: [], winner: null, slot,
  };
}

const ROUND_LABELS = ['Play-In', 'First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];

function startRound1(league: League, conf: 'East' | 'West', seeds: string[]) {
  const pairs = [[0, 7], [3, 4], [2, 5], [1, 6]];
  pairs.forEach(([a, b], slot) => {
    league.series.push(newSeries(conf, 1, ROUND_LABELS[1], seeds[a], seeds[b], a + 1, b + 1, 7, slot));
  });
}

function seriesReady(s: Series): boolean {
  return !s.winner && !!s.high && !!s.low;
}

function playoffDay(league: League): GameResult[] {
  const results: GameResult[] = [];
  for (const s of league.series.filter((x) => seriesReady(x))) {
    const n = s.winsHigh + s.winsLow;
    // 2-2-1-1-1 home court format.
    const highHome = s.bestOf === 1 || [0, 1, 4, 6].includes(n);
    const label = s.round === 0 ? s.label : `${s.label} G${n + 1}`;
    const r = playGame(league, highHome ? s.high : s.low, highHome ? s.low : s.high, league.nextGameId++, label);
    s.games.push(r.id);
    const winner = r.home.score > r.away.score ? r.home.abbr : r.away.abbr;
    if (winner === s.high) s.winsHigh++; else s.winsLow++;
    const need = Math.ceil(s.bestOf / 2);
    if (s.winsHigh >= need) s.winner = s.high;
    if (s.winsLow >= need) s.winner = s.low;
    if (s.winner && s.round >= 1) {
      const loser = s.winner === s.high ? s.low : s.high;
      addNews(league, `${league.teams[s.winner].name} defeat ${league.teams[loser].name} ${Math.max(s.winsHigh, s.winsLow)}-${Math.min(s.winsHigh, s.winsLow)} (${s.label}).`);
    }
    results.push(r);
  }
  league.playoffDay++;
  advanceBracket(league);
  return results;
}

function advanceBracket(league: League) {
  for (const conf of ['East', 'West'] as const) {
    const pi = league.series.filter((s) => s.conf === conf && s.round === 0);
    // Play-in: 7v8 winner is the 7 seed; loser hosts the 9v10 winner for the 8 seed.
    if (pi.length === 2 && pi.every((s) => s.winner)) {
      const [a, b] = pi;
      const loser78 = a.winner === a.high ? a.low : a.high;
      const loserSeed = a.winner === a.high ? a.lowSeed : a.highSeed;
      pi.push(newSeries(conf, 0, 'Play-In (8th seed)', loser78, b.winner!, loserSeed, b.winner === b.high ? b.highSeed : b.lowSeed, 1, 2));
      league.series.push(pi[2]);
    }
    if (pi.length === 3 && pi.every((s) => s.winner) && !league.series.some((s) => s.conf === conf && s.round === 1)) {
      const top6 = standings(league, conf).slice(0, 6).map((t) => t.abbr);
      startRound1(league, conf, [...top6, pi[0].winner!, pi[2].winner!]);
    }
    for (const round of [1, 2]) {
      const rs = league.series.filter((s) => s.conf === conf && s.round === round);
      if (rs.length && rs.every((s) => s.winner) && !league.series.some((s) => s.conf === conf && s.round === round + 1)) {
        for (let slot = 0; slot < rs.length / 2; slot++) {
          const x = rs.find((s) => s.slot === slot * 2)!, y = rs.find((s) => s.slot === slot * 2 + 1)!;
          const xs = x.winner === x.high ? x.highSeed : x.lowSeed;
          const ys = y.winner === y.high ? y.highSeed : y.lowSeed;
          const [hi, lo, hs, ls] = xs <= ys ? [x.winner!, y.winner!, xs, ys] : [y.winner!, x.winner!, ys, xs];
          league.series.push(newSeries(conf, round + 1, ROUND_LABELS[round + 1], hi, lo, hs, ls, 7, slot));
        }
      }
    }
  }
  const cf = league.series.filter((s) => s.round === 3);
  if (cf.length === 2 && cf.every((s) => s.winner) && !league.series.some((s) => s.round === 4)) {
    const [e, w] = cf.map((s) => league.teams[s.winner!]);
    const ePct = e.w / (e.w + e.l), wPct = w.w / (w.w + w.l);
    const [hi, lo] = ePct >= wPct ? [e, w] : [w, e];
    league.series.push(newSeries('Finals', 4, ROUND_LABELS[4], hi.abbr, lo.abbr, 1, 1, 7, 0));
  }
  const finals = league.series.find((s) => s.round === 4);
  if (finals?.winner && !league.champion) {
    league.champion = finals.winner;
    league.phase = 'offseason';
    finishSeason(league, finals);
  }
}

// ---------------------------------------------------------------- awards & season rollover

export const perGame = (s: SeasonLine, k: keyof SeasonLine) => (s.g ? (s[k] as number) / s.g : 0);

function mvpScore(league: League, p: Player): number {
  const s = p.stats;
  const team = league.teams[s.team];
  if (!team || s.g < (team.w + team.l) * 0.6) return -1;
  const g = (k: keyof SeasonLine) => perGame(s, k);
  const ts = s.pts / Math.max(1, 2 * (s.fga + 0.44 * s.fta));
  return g('pts') + 1.1 * (g('orb') + g('drb')) + 1.6 * g('ast') + 2 * (g('stl') + g('blk')) - 1.2 * g('tov') + (ts - 0.56) * 40 + (team.w / (team.w + team.l)) * 25;
}

function dpoyScore(league: League, p: Player): number {
  const s = p.stats;
  const team = league.teams[s.team];
  if (!team || s.g < (team.w + team.l) * 0.6 || perGame(s, 'min') < 24) return -1;
  return 2.5 * perGame(s, 'stl') + 2.2 * perGame(s, 'blk') + 0.5 * perGame(s, 'drb') + p.ratings.def / 8 + (team.w / (team.w + team.l)) * 6;
}

function giveRegularSeasonAwards(league: League) {
  const ps = Object.values(league.players).filter((p) => p.stats.team !== 'FA');
  const byMvp = [...ps].sort((a, b) => mvpScore(league, b) - mvpScore(league, a));
  const mvp = byMvp[0];
  const dpoy = [...ps].sort((a, b) => dpoyScore(league, b) - dpoyScore(league, a))[0];
  const allLeague = byMvp.slice(0, 5).map((p) => p.id);
  if (mvp) { mvp.awards.push(`${league.season} MVP`); addNews(league, `${mvp.name} (${mvp.stats.team}) wins MVP!`); }
  if (dpoy) { dpoy.awards.push(`${league.season} DPOY`); addNews(league, `${dpoy.name} (${dpoy.stats.team}) is Defensive Player of the Year.`); }
  for (const id of allLeague) league.players[id].awards.push(`${league.season} All-League 1st Team`);
  const user = league.teams[league.userTeam];
  league.history.push({
    season: league.season, mvp: mvp?.id, dpoy: dpoy?.id, allLeague,
    userTeam: user.abbr, userRecord: `${user.w}-${user.l}`, userResult: 'Missed playoffs',
  });
}

function finishSeason(league: League, finals: Series) {
  const h = league.history[league.history.length - 1];
  const champ = finals.winner!;
  const runner = champ === finals.high ? finals.low : finals.high;
  h.champion = champ;
  h.runnerUp = runner;
  // Finals MVP: best playoff production on the champion in the Finals.
  const champPlayers = league.teams[champ].roster.map((id) => league.players[id]);
  const fmvp = [...champPlayers].sort((a, b) => {
    const v = (p: Player) => p.playoffStats.pts + 1.2 * (p.playoffStats.orb + p.playoffStats.drb) + 1.5 * p.playoffStats.ast;
    return v(b) - v(a);
  })[0];
  if (fmvp) { h.fmvp = fmvp.id; fmvp.awards.push(`${league.season} Finals MVP`); }
  for (const id of league.teams[champ].roster) league.players[id].awards.push(`${league.season} Champion`);
  // User's result
  const u = league.userTeam;
  const userSeries = league.series.filter((s) => s.high === u || s.low === u);
  if (champ === u) h.userResult = 'Won the championship!';
  else if (userSeries.length) {
    const last = userSeries[userSeries.length - 1];
    h.userResult = last.round === 0 ? 'Lost in the play-in' : `Lost in the ${last.label}`;
  }
  addNews(league, `🏆 The ${league.teams[champ].name} are champions! Finals MVP: ${fmvp?.name ?? '—'}.`);
}

// Rolls the league into the next (fictional) season: archive stats, age & develop players,
// retirements, then a rookie draft of generated prospects.
export function startNextSeason(league: League) {
  seed(league.rngSeed);
  const next = league.season + 1;
  const retired: string[] = [];
  for (const p of Object.values(league.players)) {
    if (p.stats.g > 0) p.history.push({ ...p.stats });
    if (p.playoffStats.g > 0) p.history.push({ ...p.playoffStats, team: `${p.playoffStats.team} (PO)` });
    const msg = progress(p);
    const o = ovr(p.ratings);
    const retireChance = p.age >= 39 ? 0.9 : p.age >= 36 ? 0.45 : p.age >= 34 && o < 66 ? 0.4 : p.age >= 31 && o < 56 ? 0.35 : 0;
    if (chance(retireChance)) {
      retired.push(p.id);
      continue;
    }
    if (msg && p.stats.team === league.userTeam) addNews(league, msg);
    p.stats = emptyLine(next, p.stats.team);
    p.playoffStats = emptyLine(next, p.stats.team);
    p.morale = 70;
    p.injury = p.injury && p.injury.games > 30 ? { ...p.injury, games: p.injury.games - 30 } : null;
    p.rookie = false;
    p.tradeRequest = false;
  }
  for (const id of retired) {
    const p = league.players[id];
    if (p.stats.team === league.userTeam) addNews(league, `${p.name} has retired at age ${p.age}.`);
    for (const t of Object.values(league.teams)) {
      t.roster = t.roster.filter((x) => x !== id);
      delete t.minutes[id];
    }
    league.freeAgents = league.freeAgents.filter((x) => x !== id);
    delete league.players[id];
  }
  if (retired.length) addNews(league, `${retired.length} players retired this offseason.`);

  // Draft order: worst record first.
  const order = standings(league).reverse().map((t) => t.abbr);
  const rookies: string[] = [];
  for (let i = 0; i < 70; i++) {
    const r = generateRookie(next, i);
    league.players[r.id] = r;
    rookies.push(r.id);
  }
  rookies.sort((a, b) => (league.players[b].pot + ovr(league.players[b].ratings)) - (league.players[a].pot + ovr(league.players[a].ratings)));

  for (const t of Object.values(league.teams)) {
    t.w = 0; t.l = 0; t.homeW = 0; t.homeL = 0; t.pf = 0; t.pa = 0; t.streak = 0;
    for (const id of [...t.roster]) if (!league.players[id]) t.roster = t.roster.filter((x) => x !== id);
  }
  league.season = next;
  league.pace = paceFor(Math.min(next, 2026));
  league.schedule = [];
  league.series = [];
  league.champion = null;
  league.phase = 'rookie-draft';
  league.draft = { order: [...order, ...order], pick: 0, picks: [], pool: rookies, rookie: true, started: true, timer: 0, queue: [] };
  league.rngSeed = getSeed();
  addNews(league, `Welcome to the ${next - 1}-${String(next).slice(2)} offseason. The rookie draft is next.`);
}

export function addNews(league: League, text: string) {
  league.news.unshift({ day: league.day, season: league.season, text });
  if (league.news.length > 300) league.news.length = 300;
}

export function teamOvr(league: League, team: Team): number {
  const top = team.roster.map((id) => league.players[id]).filter((p) => !p.injury)
    .map((p) => ovr(p.ratings)).sort((a, b) => b - a).slice(0, 10);
  const w = [4, 4, 4, 4, 4, 2.5, 2, 1.5, 1, 0.5];
  let s = 0, ws = 0;
  top.forEach((v, i) => { s += v * w[i]; ws += w[i]; });
  return ws ? Math.round(s / ws) : 0;
}
