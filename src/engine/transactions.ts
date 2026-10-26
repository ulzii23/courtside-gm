import type { League, Player, Team } from '../types';
import { addNews, autoRotation, normalizeMinutes, releasePlayer, ROSTER_MAX, ROSTER_MIN, sanitizeRotation, signPlayer, updateChemistry } from './league';
import { ovr } from './ratings';
import { chance, hashUnit, random } from './random';

// ---------------------------------------------------------------- trade value

export function tradeDeadlineDay(league: League): number {
  const last = league.schedule.reduce((m, g) => Math.max(m, g.day), 0);
  return Math.floor(last * 0.6);
}

export function tradingOpen(league: League): { open: boolean; why: string } {
  if (league.phase === 'regular') {
    const deadline = tradeDeadlineDay(league);
    return league.day <= deadline
      ? { open: true, why: `Trade deadline: day ${deadline + 1}` }
      : { open: false, why: 'The trade deadline has passed. Trading reopens after the Finals.' };
  }
  if (league.phase === 'offseason') return { open: true, why: 'Offseason trading window' };
  return { open: false, why: 'Trades are not allowed during the draft or playoffs.' };
}

// How much a team values a player: stars are worth far more than several role players,
// young players get credit for potential, old players and long injuries lose value.
export function playerValue(p: Player, ownTeam = false): number {
  const o = ovr(p.ratings);
  let v = Math.pow(Math.max(0, o - 50), 2) / 10;
  const upside = Math.max(0, p.pot - o);
  if (p.age <= 23) v *= 1 + upside / 50;
  else if (p.age <= 28) v *= 1 + upside / 120;
  else if (p.age <= 30) v *= 0.95;
  else if (p.age <= 32) v *= 0.85;
  else if (p.age <= 34) v *= 0.65;
  else v *= 0.4;
  if (p.injury && p.injury.games > 20) v *= 0.6;
  // A team is happy to move a player who wants out.
  if (ownTeam && p.tradeRequest) v *= 0.8;
  return v;
}

export interface TradeVerdict {
  ok: boolean;
  message: string;
  give: number; // value the AI team gives up
  get: number; // value the AI team receives
}

export function evaluateTrade(league: League, aiAbbr: string, aiReceives: string[], aiSends: string[]): TradeVerdict {
  const user = league.teams[league.userTeam];
  const ai = league.teams[aiAbbr];
  const get = aiReceives.reduce((s, id) => s + playerValue(league.players[id]), 0);
  const give = aiSends.reduce((s, id) => s + playerValue(league.players[id], true), 0);
  const base = { give, get };
  const window = tradingOpen(league);
  if (!window.open) return { ok: false, message: window.why, ...base };
  if (!aiReceives.length && !aiSends.length) return { ok: false, message: 'Add players to the trade.', ...base };
  const userAfter = user.roster.length - aiReceives.length + aiSends.length;
  const aiAfter = ai.roster.length - aiSends.length + aiReceives.length;
  if (userAfter > ROSTER_MAX) return { ok: false, message: `You would have ${userAfter} players (max ${ROSTER_MAX}).`, ...base };
  if (aiAfter > ROSTER_MAX) return { ok: false, message: `${ai.name} would have ${aiAfter} players (max ${ROSTER_MAX}).`, ...base };
  if (userAfter < ROSTER_MIN || aiAfter < ROSTER_MIN) return { ok: false, message: `Both teams need at least ${ROSTER_MIN} players.`, ...base };
  if (get >= give * 1.05 + 1) return { ok: true, message: `${ai.name} accept the trade!`, ...base };
  const short = give * 1.05 + 1 - get;
  return {
    ok: false,
    message: short > give * 0.5 ? `${ai.name} laugh at this offer.` : `${ai.name} are close, but want a bit more value.`,
    ...base,
  };
}

export function executeTrade(league: League, a: string, b: string, aSends: string[], bSends: string[]) {
  const ta = league.teams[a], tb = league.teams[b];
  const move = (from: Team, to: Team, ids: string[]) => {
    for (const id of ids) {
      from.roster = from.roster.filter((x) => x !== id);
      delete from.minutes[id];
      to.roster.push(id);
      to.minutes[id] = 0;
      const p = league.players[id];
      p.stats.team = to.abbr;
      p.playoffStats.team = to.abbr;
      // A fresh start: a player who wanted out is happy again.
      p.morale = p.tradeRequest ? 75 : Math.max(55, p.morale - 5 * (p.personality.loyal / 50));
      p.tradeRequest = false;
    }
  };
  move(ta, tb, aSends);
  move(tb, ta, bSends);
  for (const t of [ta, tb]) {
    if (t.autoLineup) autoRotation(league, t, false);
    else { sanitizeRotation(league, t); normalizeMinutes(t); }
    updateChemistry(league, t);
  }
  league.trades.push({ day: league.day, season: league.season, teams: [a, b], sent: [aSends, bSends] });
  const names = (ids: string[]) => ids.map((id) => league.players[id].name).join(', ') || 'nothing';
  addNews(league, `🔁 TRADE: ${ta.name} send ${names(aSends)} to the ${tb.name} for ${names(bSends)}.`);
}

// ---------------------------------------------------------------- AI roster moves

export function aiDailyMoves(league: League) {
  const deadline = tradeDeadlineDay(league);
  for (const t of Object.values(league.teams)) {
    if (t.abbr === league.userTeam) continue;
    // Injuries piling up: sign a body right away.
    const healthy = t.roster.filter((id) => !league.players[id].injury).length;
    if (healthy < 9 && t.roster.length < ROSTER_MAX) signBestFA(league, t, true);
  }
  if (league.day % 7 !== 0) return;
  for (const t of Object.values(league.teams)) if (t.abbr !== league.userTeam) aiFreeAgency(league, t);
  if (league.day <= deadline && chance(0.45)) aiTrade(league);
}

function bestFA(league: League): Player | undefined {
  return league.freeAgents.map((id) => league.players[id]).filter((p) => p && !p.injury).sort((a, b) => ovr(b.ratings) - ovr(a.ratings))[0];
}

function signBestFA(league: League, t: Team, quiet: boolean) {
  const fa = bestFA(league);
  if (!fa) return;
  signPlayer(league, t.abbr, fa.id, quiet && ovr(fa.ratings) < 68);
  autoRotation(league, t, false);
}

function aiFreeAgency(league: League, t: Team) {
  const fa = bestFA(league);
  if (!fa) return;
  if (t.roster.length < 13) return signBestFA(league, t, false);
  // Upgrade: swap the worst healthy player for a clearly better free agent.
  const worst = t.roster.map((id) => league.players[id]).filter((p) => !p.injury || p.injury.games > 30)
    .sort((a, b) => playerValue(a) - playerValue(b))[0];
  if (worst && ovr(fa.ratings) >= ovr(worst.ratings) + 4 && playerValue(fa) > playerValue(worst) * 1.3) {
    if (t.roster.length >= ROSTER_MAX) releasePlayer(league, t.abbr, worst.id, ovr(worst.ratings) < 68);
    signPlayer(league, t.abbr, fa.id, ovr(fa.ratings) < 68);
    autoRotation(league, t, false);
  }
}

// One AI-to-AI trade: teams move unhappy players first, otherwise swap similar-value players at different positions.
function aiTrade(league: League) {
  const ai = Object.values(league.teams).filter((t) => t.abbr !== league.userTeam);
  const requesters = ai.flatMap((t) => t.roster.filter((id) => league.players[id].tradeRequest).map((id) => ({ t, id })));
  let seller: Team, outgoing: Player;
  if (requesters.length) {
    const r = requesters[Math.floor(random() * requesters.length)];
    seller = r.t;
    outgoing = league.players[r.id];
  } else {
    seller = ai[Math.floor(random() * ai.length)];
    const pool = seller.roster.slice(2, 10).map((id) => league.players[id]).filter((p) => !p.injury);
    if (!pool.length) return;
    outgoing = pool[Math.floor(random() * pool.length)];
  }
  const want = playerValue(outgoing, true);
  if (want < 2) return;
  const offers: { team: Team; p: Player; score: number }[] = [];
  for (const buyer of ai) {
    if (buyer === seller) continue;
    for (const id of buyer.roster) {
      const p = league.players[id];
      if (p.pos === outgoing.pos || p.injury) continue;
      const v = playerValue(p, true);
      const ratio = v / want;
      if (ratio < 0.8 || ratio > 1.15) continue;
      // Both sides should see it as roughly fair from their own point of view.
      if (playerValue(outgoing) < v * 0.9) continue;
      offers.push({ team: buyer, p, score: Math.abs(1 - ratio) + random() * 0.2 });
    }
  }
  if (!offers.length) return;
  const best = offers.sort((x, y) => x.score - y.score)[0];
  executeTrade(league, seller.abbr, best.team.abbr, [outgoing.id], [best.p.id]);
}

// Older saves predate some fields.
export function migrateLeague(league: League) {
  league.trades ??= [];
  if (league.draft && league.draft.started === undefined) Object.assign(league.draft, { started: true, timer: 0, queue: [] });
  for (const p of Object.values(league.players)) {
    if (p.personality.loyal === undefined) {
      p.personality.loyal = Math.round(Math.max(5, Math.min(99, 52 + (p.age - 26) * 1.2 + (hashUnit(p.id, 7) * 2 - 1) * 38)));
    }
  }
}
