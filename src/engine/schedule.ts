import type { ScheduledGame, Team } from '../types';
import { random, shuffle } from './random';

// NBA-style 82 games: division rivals 4x, 6 conference teams 4x, 4 conference teams 3x, other conference 2x.
export function makeSchedule(teams: Team[]): ScheduledGame[] {
  const pairs: [string, string, number][] = [];
  for (const conf of ['East', 'West'] as const) {
    const confTeams = teams.filter((t) => t.conf === conf);
    const threeTimes = threeGameGraph(confTeams);
    for (let i = 0; i < confTeams.length; i++) {
      for (let j = i + 1; j < confTeams.length; j++) {
        const a = confTeams[i], b = confTeams[j];
        const n = a.div === b.div ? 4 : threeTimes.has(key(a.abbr, b.abbr)) ? 3 : 4;
        pairs.push([a.abbr, b.abbr, n]);
      }
    }
  }
  const east = teams.filter((t) => t.conf === 'East');
  const west = teams.filter((t) => t.conf === 'West');
  for (const a of east) for (const b of west) pairs.push([a.abbr, b.abbr, 2]);

  const games: { home: string; away: string }[] = [];
  for (const [a, b, n] of pairs) {
    const aHomeFirst = random() < 0.5;
    for (let k = 0; k < n; k++) {
      // Alternate venues; the odd third game goes to a random side.
      const aHome = k % 2 === 0 ? aHomeFirst : !aHomeFirst;
      games.push(aHome ? { home: a, away: b } : { home: b, away: a });
    }
  }
  return spreadOverDays(games);
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Each team plays 4 of its 10 non-division conference opponents three times (a 4-regular graph).
function threeGameGraph(confTeams: Team[]): Set<string> {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const need = new Map(confTeams.map((t) => [t.abbr, 4]));
    const edges = new Set<string>();
    const order = shuffle([...confTeams]);
    let ok = true;
    for (const t of order) {
      while (need.get(t.abbr)! > 0) {
        const options = confTeams.filter(
          (o) => o.abbr !== t.abbr && o.div !== t.div && need.get(o.abbr)! > 0 && !edges.has(key(t.abbr, o.abbr)),
        );
        if (!options.length) { ok = false; break; }
        const o = options[Math.floor(random() * options.length)];
        edges.add(key(t.abbr, o.abbr));
        need.set(t.abbr, need.get(t.abbr)! - 1);
        need.set(o.abbr, need.get(o.abbr)! - 1);
      }
      if (!ok) break;
    }
    if (ok) return edges;
  }
  return new Set();
}

function spreadOverDays(games: { home: string; away: string }[]): ScheduledGame[] {
  const remaining = shuffle(games);
  const out: ScheduledGame[] = [];
  const lastPlayed = new Map<string, number>();
  let day = 0;
  let id = 0;
  while (remaining.length) {
    const busy = new Set<string>();
    const target = 4 + Math.floor(random() * 9);
    for (let i = 0; i < remaining.length && busy.size < target * 2; i++) {
      const g = remaining[i];
      if (busy.has(g.home) || busy.has(g.away)) continue;
      // Limit back-to-backs: a team that played yesterday is skipped most of the time.
      const restH = day - (lastPlayed.get(g.home) ?? -9);
      const restA = day - (lastPlayed.get(g.away) ?? -9);
      if ((restH === 1 || restA === 1) && random() < 0.75 && remaining.length > 40) continue;
      busy.add(g.home);
      busy.add(g.away);
      out.push({ id: id++, day, home: g.home, away: g.away, played: false });
      remaining.splice(i, 1);
      i--;
    }
    for (const t of busy) lastPlayed.set(t, day);
    day++;
  }
  return out;
}
