import type { BoxLine, Honor, League, PeriodLine as Acc, Player, Team } from '../types';
import { seasonLabel } from '../data/teams';
import { addNews } from './league';
import { ovr } from './ratings';
import { chance, random } from './random';

// Player of the Week / Month awards and the social feed: reporter scoops, player posts,
// fan reactions and rumors driven by morale, streaks, egos and hot shooting.

// ---------------------------------------------------------------- period stats

const emptyAcc = (): Acc => ({ g: 0, w: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, tpm: 0 });

export function recordPeriodLine(league: League, l: BoxLine, won: boolean) {
  if (l.min <= 0) return;
  league.period ??= { week: {}, month: {} };
  for (const bucket of [league.period.week, league.period.month]) {
    const a = (bucket[l.id] ??= emptyAcc());
    a.g++; if (won) a.w++;
    a.pts += l.pts; a.reb += l.orb + l.drb; a.ast += l.ast; a.stl += l.stl; a.blk += l.blk; a.tov += l.tov;
    a.fgm += l.fgm; a.fga += l.fga; a.ftm += l.ftm; a.fta += l.fta; a.tpm += l.tpm;
  }
}

// Per-game impact, with a bonus for winning.
function score(a: Acc) {
  const raw = a.pts + 0.5 * a.reb + a.ast + 1.5 * a.stl + 1.5 * a.blk - a.tov - 0.4 * (a.fga - a.fgm) - 0.3 * (a.fta - a.ftm);
  return raw / a.g + (a.w / a.g) * 4;
}
const line = (a: Acc) => {
  const pg = (x: number) => (x / a.g).toFixed(1);
  return `${pg(a.pts)} pts, ${pg(a.reb)} reb, ${pg(a.ast)} ast (${a.w}-${a.g - a.w})`;
};

const MONTHS = ['October/November', 'December', 'January', 'February', 'March', 'April'];
const isRookie = (league: League, p: Player) => !!p.rookie || (league.season === league.baseSeason && p.age <= 21);

function pickWinners(league: League, bucket: Record<string, Acc>, minGames: number, filter: (p: Player) => boolean = () => true) {
  const out: { conf: 'East' | 'West'; p: Player; a: Acc }[] = [];
  for (const conf of ['East', 'West'] as const) {
    let best: { p: Player; a: Acc; s: number } | null = null;
    for (const [id, a] of Object.entries(bucket)) {
      const p = league.players[id];
      const t = p && league.teams[p.stats.team];
      if (!p || !t || t.conf !== conf || a.g < minGames || !filter(p)) continue;
      const s = score(a);
      if (!best || s > best.s) best = { p, a, s };
    }
    if (best) out.push({ conf, p: best.p, a: best.a });
  }
  return out;
}

function announce(league: League, kind: Honor['kind'], label: string, winners: ReturnType<typeof pickWinners>) {
  const title = kind === 'POW' ? 'Player of the Week' : kind === 'POM' ? 'Player of the Month' : 'Rookie of the Month';
  for (const { conf, p, a } of winners) {
    const team = p.stats.team;
    league.honors ??= [];
    league.honors.unshift({ season: league.season, day: league.day, kind, label, conf, pid: p.id, team, line: line(a) });
    if (league.honors.length > 200) league.honors.length = 200;
    p.awards.push(`${seasonLabel(league.season)} ${title}`);
    p.morale = Math.min(100, p.morale + (kind === 'POW' ? 3 : 6));
    addNews(league, `🏅 ${p.name} (${team}) is the ${conf} ${title} for ${label}: ${line(a)}.`, { kind: 'award', pid: p.id, team });
    if (chance(0.6)) post(league, handleOf(p), pickOne(AWARD_REACTIONS)(p, title), p, team);
  }
}

// Called once after each regular-season day.
export function endOfDay(league: League) {
  const p = league.period;
  if (p) {
    if (league.day % 7 === 0) {
      announce(league, 'POW', `Week ${league.day / 7}`, pickWinners(league, p.week, 3));
      p.week = {};
    }
    if (league.day % 30 === 0) {
      const label = MONTHS[Math.min(MONTHS.length - 1, league.day / 30 - 1)];
      announce(league, 'POM', label, pickWinners(league, p.month, 8));
      announce(league, 'ROM', label, pickWinners(league, p.month, 8, (x) => isRookie(league, x)));
      p.month = {};
    }
  }
  chatter(league);
}

// ---------------------------------------------------------------- social feed

const REPORTER = '@CourtsideInsider';
const WIRE = '@HoopsWireDaily';
const FANS = ['@TheBenchMob', '@BuzzerBeaterBets', '@HardwoodHotTakes', '@NosebleedSeats'];
const pickOne = <T,>(xs: T[]): T => xs[Math.floor(random() * xs.length)];
const last = (p: Player) => p.name.split(' ').slice(-1)[0];
const nick = (t: Team) => t.name.split(' ').slice(-1)[0];
export const handleOf = (p: Player) => '@' + (p.name[0] + last(p)).normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase();

function post(league: League, by: string, text: string, p?: Player, team?: string) {
  addNews(league, text, { kind: 'social', by, pid: p?.id, team: team ?? p?.stats.team });
}

const AWARD_REACTIONS: ((p: Player, title: string) => string)[] = [
  () => 'Blessed. Credit to my teammates 🙏',
  () => 'Lock in. Back to work tomorrow.',
  (_, title) => `${title}. Not bad. Still hungry 😤`,
  () => 'Shoutout the whole squad. We eating 🍽️',
];

const UNHAPPY_SCOOPS: ((p: Player, t: Team) => string)[] = [
  (p, t) => `Sources: ${p.name} is frustrated with his role in ${t.name.replace(` ${nick(t)}`, '')} and has voiced it to people close to him.`,
  (p, t) => `${p.name} skipped his postgame media session. League sources say the ${nick(t)} ${p.pos} is unhappy with his minutes.`,
  (p, t) => `Rival executives are monitoring ${p.name}'s situation with the ${nick(t)}. Relationship described as "strained."`,
  (p) => `Hearing ${p.name}'s camp is not thrilled with how he is being used. Something to watch.`,
];
const CRYPTIC: string[] = ['👀', '🤐', 'Time will tell…', 'Just want to hoop.', 'Know your worth.', 'Loyalty is a two-way street.', 'Patience running thin.', '🙃'];
const TRADE_REQUEST_SCOOPS: ((p: Player, t: Team) => string)[] = [
  (p, t) => `BREAKING: ${p.name} has formally requested a trade from the ${t.name}, sources tell me.`,
  (p, t) => `${p.name} wants out of ${t.name.replace(` ${nick(t)}`, '')}. Trade request delivered to the front office today.`,
];
const STILL_WANTS_OUT: ((p: Player, t: Team, n: number) => string)[] = [
  (p, t, n) => `${n} teams have called the ${nick(t)} about ${p.name}. His trade request still stands.`,
  (p, t) => `Nothing imminent on ${p.name}, but the ${nick(t)} are listening to offers.`,
];
const HOT: ((p: Player, ppg: string) => string)[] = [
  (p, ppg) => `${p.name} is HIM. ${ppg} a night this week 🔥🔥`,
  (p, ppg) => `Somebody guard ${last(p)}?? ${ppg} ppg this week is ridiculous`,
  (p, ppg) => `${last(p)} averaging ${ppg} this week. MVP conversation? 🤔`,
];
const WIN_STREAK: ((t: Team, n: number) => string)[] = [
  (t, n) => `${n} straight wins for the ${nick(t)}. This is not a drill 🚨`,
  (t, n) => `Bandwagon is filling up fast. ${t.name} have won ${n} in a row.`,
  (t, n) => `${nick(t)} rattle off win #${n} in a row. Contenders?`,
];
const LOSE_STREAK: ((t: Team, n: number) => string)[] = [
  (t, n) => `${n} straight losses. Somebody do something about the ${nick(t)} 😩`,
  (t, n) => `${t.name} have dropped ${n} in a row. Pressure is mounting on the front office.`,
  (t) => `Turning off the ${nick(t)} game. I can't do this anymore.`,
];
const CLASH: ((a: Player, b: Player, t: Team) => string)[] = [
  (a, b, t) => `Locker room tension in ${t.name.replace(` ${nick(t)}`, '')}: ${a.name} and ${b.name} reportedly had a heated exchange after the loss.`,
  (a, b) => `Hearing there's friction between ${last(a)} and ${last(b)} over shots. Two alphas, one ball.`,
];
const RUMOR: ((p: Player, t: Team) => string)[] = [
  (p, t) => `Sources: the ${nick(t)} are willing to listen to offers for ${p.name} as they consider their direction.`,
  (p, t) => `Several contenders have checked in on ${p.name}. The ${nick(t)} have not shut down talks.`,
];
const LEADER: ((p: Player) => string)[] = [
  () => 'This group is special. Stay together, stay locked in 🔒',
  () => 'Brotherhood. That\'s it. That\'s the tweet.',
  () => 'One game at a time. Proud of these guys.',
];

const STREAK_MILESTONES = new Set([5, 8, 12, 16, 20]);

// A few posts per day at most, weighted toward the user's team so the feed feels personal.
function chatter(league: League) {
  let budget = 3;
  const say = (by: string, text: string, p?: Player, team?: string) => { if (budget-- > 0) post(league, by, text, p, team); };
  const teams = Object.values(league.teams);
  const mineBoost = (t: Team) => (t.abbr === league.userTeam ? 2.5 : 1);

  for (const t of teams) {
    for (const id of t.roster) {
      const p = league.players[id];
      if (!p || p.expMin < 15) continue;
      // Unhappy players leak it before they ask out.
      if (p.morale < 40 && !p.tradeRequest && chance(0.035 * mineBoost(t) * (0.5 + p.personality.ego / 100))) {
        if (chance(0.45)) say(handleOf(p), pickOne(CRYPTIC), p);
        else say(REPORTER, pickOne(UNHAPPY_SCOOPS)(p, t), p);
      }
      if (p.tradeRequest && chance(0.02 * mineBoost(t))) say(REPORTER, pickOne(STILL_WANTS_OUT)(p, t, 2 + Math.floor(random() * 6)), p);
    }
    // Streaks, at milestones only so the same streak isn't posted every day.
    if (STREAK_MILESTONES.has(Math.abs(t.streak)) && chance(Math.min(1, 0.35 * mineBoost(t)))) {
      const n = Math.abs(t.streak);
      if (t.streak > 0) say(pickOne([...FANS, WIRE]), pickOne(WIN_STREAK)(t, n), undefined, t.abbr);
      else say(pickOne([...FANS, WIRE]), pickOne(LOSE_STREAK)(t, n), undefined, t.abbr);
    }
    // Two big egos on a losing team.
    if (t.streak <= -3 && chance(0.06 * mineBoost(t))) {
      const egos = t.roster.map((id) => league.players[id]).filter((p) => p && p.personality.ego >= 75 && (t.minutes[p.id] ?? 0) >= 20);
      if (egos.length >= 2) say(REPORTER, pickOne(CLASH)(egos[0], egos[1], t), egos[0]);
    }
    // Leaders talk it up on a heater.
    const captain = t.strategy.captain ? league.players[t.strategy.captain] : null;
    if (captain && (t.streak === 4 || t.streak === 9) && captain.personality.lead >= 70 && chance(0.25 * mineBoost(t))) say(handleOf(captain), pickOne(LEADER)(captain), captain);
    // Stars on bad teams get floated in rumors.
    const games = t.w + t.l;
    if (games >= 15 && t.w / games < 0.4 && chance(0.03)) {
      const star = t.roster.map((id) => league.players[id]).filter((p) => p && ovr(p.ratings) >= 78).sort((a, b) => ovr(b.ratings) - ovr(a.ratings))[0];
      if (star) say(WIRE, pickOne(RUMOR)(star, t), star);
    }
  }
  // Hot hands this week.
  for (const [id, a] of Object.entries(league.period?.week ?? {})) {
    if (a.g >= 3 && a.pts / a.g >= 30 && chance(0.12)) {
      const p = league.players[id];
      if (p) say(pickOne(FANS), pickOne(HOT)(p, (a.pts / a.g).toFixed(1)), p);
    }
  }
}

// Hooks for events that already make the news.
export function tradeRequestBuzz(league: League, p: Player, t: Team) {
  post(league, REPORTER, pickOne(TRADE_REQUEST_SCOOPS)(p, t), p);
  if (chance(0.5)) post(league, pickOne(FANS), `${last(p)} wants out?? ${t.abbr === league.userTeam ? 'Front office better figure this out FAST' : 'Get him on my team 🙏'}`, p);
}

export function bigGameBuzz(league: League, p: Player, l: BoxLine) {
  if (!chance(0.7)) return;
  const reb = l.orb + l.drb;
  const text = l.pts >= 45
    ? pickOne([`${p.name} just dropped ${l.pts}. Video game numbers 🎮`, `${l.pts} for ${last(p)}. Unreal.`, `${last(p)} with ${l.pts} tonight. Put some respect on his name.`])
    : pickOne([`Triple-double for ${p.name}: ${l.pts}/${reb}/${l.ast} 📈`, `${last(p)} filled up the box score again. ${l.pts}-${reb}-${l.ast}.`]);
  post(league, pickOne([...FANS, WIRE]), text, p);
}
