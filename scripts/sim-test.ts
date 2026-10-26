// Sanity check for the engine: drafts and sims a full season (and the next one) without the UI.
// Usage: npx tsx scripts/sim-test.ts [season]
import { readFileSync } from 'node:fs';
import {
  autoDraftRest, createLeague, finishDraft, perGame, simDay, standings, startNextSeason, teamOvr,
} from '../src/engine/league';
import { ovr } from '../src/engine/ratings';
import type { League } from '../src/types';

const season = Number(process.argv[2] ?? 2016);
const raw = JSON.parse(readFileSync(`public/data/${season}.json`, 'utf8'));
const league: League = createLeague(season, raw.players, 'GSW', 12345);

const top = Object.values(league.players).sort((a, b) => ovr(b.ratings) - ovr(a.ratings)).slice(0, 12);
console.log('Top OVR:', top.map((p) => `${p.name} ${ovr(p.ratings)}`).join(', '));

autoDraftRest(league);
finishDraft(league);

function runSeason() {
  const t0 = Date.now();
  let games = 0;
  while (league.phase === 'regular' || league.phase === 'playoffs') games += simDay(league).length;
  console.log(`\n== ${league.season}: ${games} games in ${Date.now() - t0}ms`);

  const teams = Object.values(league.teams);
  const ppg = teams.reduce((s, t) => s + t.pf, 0) / teams.reduce((s, t) => s + t.w + t.l, 0);
  console.log('League PPG (regular+playoffs):', ppg.toFixed(1));
  for (const conf of ['East', 'West'] as const) {
    console.log(conf, standings(league, conf).map((t) => `${t.abbr} ${t.w}-${t.l} (${teamOvr(league, t)})`).join(', '));
  }
  const ps = Object.values(league.players).filter((p) => p.stats.g >= 40);
  const lead = (k: Parameters<typeof perGame>[1], n = 6) =>
    [...ps].sort((a, b) => perGame(b.stats, k) - perGame(a.stats, k)).slice(0, n)
      .map((p) => `${p.name} ${perGame(p.stats, k).toFixed(1)}`).join(', ');
  console.log('PTS:', lead('pts'));
  console.log('AST:', lead('ast'));
  console.log('STL:', lead('stl'));
  console.log('BLK:', lead('blk'));
  console.log('3PM:', lead('tpm'));
  console.log('MIN:', lead('min'));
  const rebs = [...ps].sort((a, b) => (b.stats.orb + b.stats.drb) / b.stats.g - (a.stats.orb + a.stats.drb) / a.stats.g).slice(0, 6);
  console.log('REB:', rebs.map((p) => `${p.name} ${((p.stats.orb + p.stats.drb) / p.stats.g).toFixed(1)}`).join(', '));
  const all = Object.values(league.players);
  const sum = (k: 'fgm' | 'fga' | 'tpm' | 'tpa' | 'ftm' | 'fta') => all.reduce((s, p) => s + p.stats[k], 0);
  console.log(`FG% ${(sum('fgm') / sum('fga')).toFixed(3)}  3P% ${(sum('tpm') / sum('tpa')).toFixed(3)}  FT% ${(sum('ftm') / sum('fta')).toFixed(3)}  3PA/FGA ${(sum('tpa') / sum('fga')).toFixed(3)}`);
  const h = league.history[league.history.length - 1];
  const nm = (id?: string) => (id ? league.players[id]?.name : '-');
  console.log(`Champion ${h.champion} over ${h.runnerUp}; MVP ${nm(h.mvp)}; DPOY ${nm(h.dpoy)}; FMVP ${nm(h.fmvp)}; user: ${h.userRecord} ${h.userResult}`);
  console.log('Series:', league.series.map((s) => `${s.label}:${s.high}-${s.low} ${s.winsHigh}-${s.winsLow}`).join(' | '));
}

runSeason();
startNextSeason(league);
autoDraftRest(league);
finishDraft(league);
runSeason();
console.log('JSON size (KB):', Math.round(JSON.stringify(league).length / 1024));

{
  const all = Object.values(league.players);
  const games = Object.values(league.teams).reduce((s, t) => s + t.w + t.l, 0);
  const tot = (k: 'orb' | 'drb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'fta') => (all.reduce((s, p) => s + p.stats[k], 0) / games).toFixed(1);
  console.log(`Per team game: ORB ${tot('orb')} DRB ${tot('drb')} AST ${tot('ast')} STL ${tot('stl')} BLK ${tot('blk')} TOV ${tot('tov')} PF ${tot('pf')} FTA ${tot('fta')}`);
}
console.log('Trades:', league.trades.length, 'Trade requests:', Object.values(league.players).filter((p) => p.tradeRequest).length);
console.log(league.news.filter((n) => /TRADE|requested|signed/.test(n.text)).slice(0, 8).map((n) => n.text).join('\n'));
