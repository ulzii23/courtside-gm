import { useMemo, useState } from 'react';
import { standings, teamOvr } from '../engine/league';
import { ovr } from '../engine/ratings';
import { go, useLeague } from '../store';
import type { League, Player, Series } from '../types';
import { Card, f1, Headshot, Ovr, pct, PlayerLink, perGameRow, TeamBadge, TeamLink, Th, useSort } from './common';

export function Standings() {
  const league = useLeague();
  return (
    <div className="two-col">
      {(['East', 'West'] as const).map((conf) => {
        const rows = standings(league, conf);
        const leader = rows[0];
        const playIn = league.season >= 2021 || league.baseSeason >= 2021;
        return (
          <Card key={conf} title={`${conf}ern Conference`}>
            <table className="tbl standings">
              <thead><tr><th>#</th><th>Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>Home</th><th>Away</th><th>Diff</th><th>Strk</th><th>OVR</th></tr></thead>
              <tbody>
                {rows.map((t, i) => {
                  const gb = ((leader.w - t.w) + (t.l - leader.l)) / 2;
                  const diff = (t.pf - t.pa) / Math.max(1, t.w + t.l);
                  return (
                    <tr key={t.abbr} className={`${t.abbr === league.userTeam ? 'mine' : ''} ${i === 5 && playIn ? 'cut' : ''} ${i === (playIn ? 9 : 7) ? 'cut' : ''}`}>
                      <td>{i + 1}</td>
                      <td><TeamLink league={league} abbr={t.abbr} full /></td>
                      <td>{t.w}</td><td>{t.l}</td><td>{pct(t.w, t.w + t.l)}</td><td>{gb === 0 ? '—' : gb.toFixed(1)}</td>
                      <td>{t.homeW}-{t.homeL}</td><td>{t.w - t.homeW}-{t.l - t.homeL}</td>
                      <td className={diff > 0 ? 'win' : diff < 0 ? 'loss' : ''}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}</td>
                      <td>{t.streak > 0 ? `W${t.streak}` : t.streak < 0 ? `L${-t.streak}` : '—'}</td>
                      <td>{teamOvr(league, t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted small">{playIn ? 'Top 6 make the playoffs; 7-10 go to the play-in.' : 'Top 8 make the playoffs.'}</p>
          </Card>
        );
      })}
    </div>
  );
}

type StatKey = 'name' | 'team' | 'g' | 'min' | 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'fgp' | 'tpp' | 'ftp' | 'tpm' | 'ts' | 'pm' | 'ovr';

export function Stats() {
  const league = useLeague();
  const [mode, setMode] = useState<'regular' | 'playoffs'>('regular');
  const [team, setTeam] = useState<string>('all');
  const [minG, setMinG] = useState(0);
  const sort = useSort<StatKey>('pts');

  const rows = useMemo(() => {
    return Object.values(league.players)
      .map((p) => ({ p, s: mode === 'regular' ? p.stats : p.playoffStats }))
      .filter(({ p, s }) => s.g > 0 && s.g >= minG && (team === 'all' || p.stats.team === team))
      .map(({ p, s }) => ({ p, r: perGameRow(s), team: p.stats.team }))
      .sort((a, b) => {
        const v = (x: typeof a): number | string =>
          sort.key === 'name' ? x.p.name : sort.key === 'team' ? x.team : sort.key === 'ovr' ? ovr(x.p.ratings) : (x.r as Record<string, number>)[sort.key];
        const va = v(a), vb = v(b);
        return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
      })
      .slice(0, 300);
  }, [league, league.day, mode, team, minG, sort.key, sort.dir]);

  return (
    <Card
      title="Player stats (per game)"
      right={
        <div className="filters">
          <div className="seg">
            <button className={mode === 'regular' ? 'on' : ''} onClick={() => setMode('regular')}>Regular season</button>
            <button className={mode === 'playoffs' ? 'on' : ''} onClick={() => setMode('playoffs')}>Playoffs</button>
          </div>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All teams</option>
            {Object.values(league.teams).sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.abbr} value={t.abbr}>{t.name}</option>)}
          </select>
          <select value={minG} onChange={(e) => setMinG(Number(e.target.value))}>
            <option value={0}>Any games</option><option value={10}>10+ games</option><option value={30}>30+ games</option><option value={58}>58+ games</option>
          </select>
        </div>
      }
    >
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <Th k="name" sort={sort}>Player</Th><Th k="team" sort={sort}>Team</Th><Th k="ovr" sort={sort}>OVR</Th><Th k="g" sort={sort}>G</Th><Th k="min" sort={sort}>MIN</Th>
              <Th k="pts" sort={sort}>PTS</Th><Th k="reb" sort={sort}>REB</Th><Th k="ast" sort={sort}>AST</Th><Th k="stl" sort={sort}>STL</Th>
              <Th k="blk" sort={sort}>BLK</Th><Th k="tov" sort={sort}>TOV</Th><Th k="fgp" sort={sort}>FG%</Th><Th k="tpm" sort={sort}>3PM</Th>
              <Th k="tpp" sort={sort}>3P%</Th><Th k="ftp" sort={sort}>FT%</Th><Th k="ts" sort={sort}>TS%</Th><Th k="pm" sort={sort}>+/-</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, r, team: t }) => (
              <tr key={p.id} className={t === league.userTeam ? 'mine' : ''}>
                <td><PlayerLink league={league} id={p.id} /></td><td><TeamBadge league={league} abbr={t} size={16} /></td><td><Ovr p={p} /></td>
                <td>{r.g}</td><td>{f1(r.min)}</td><td><strong>{f1(r.pts)}</strong></td><td>{f1(r.reb)}</td><td>{f1(r.ast)}</td>
                <td>{f1(r.stl)}</td><td>{f1(r.blk)}</td><td>{f1(r.tov)}</td><td>{r.fgp.toFixed(3).replace(/^0/, '')}</td><td>{f1(r.tpm)}</td>
                <td>{r.tpp.toFixed(3).replace(/^0/, '')}</td><td>{r.ftp.toFixed(3).replace(/^0/, '')}</td><td>{r.ts.toFixed(3).replace(/^0/, '')}</td>
                <td>{r.pm > 0 ? '+' : ''}{f1(r.pm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const LEADER_CATS: [string, (r: ReturnType<typeof perGameRow>) => number, (v: number) => string, number?][] = [
  ['Points', (r) => r.pts, f1], ['Rebounds', (r) => r.reb, f1], ['Assists', (r) => r.ast, f1],
  ['Steals', (r) => r.stl, f1], ['Blocks', (r) => r.blk, f1], ['3-Pointers Made', (r) => r.tpm, f1],
  ['FG%', (r) => r.fgp, (v) => (v * 100).toFixed(1) + '%', 1], ['3P%', (r) => r.tpp, (v) => (v * 100).toFixed(1) + '%', 2],
  ['FT%', (r) => r.ftp, (v) => (v * 100).toFixed(1) + '%', 3], ['Plus/Minus', (r) => r.pm, (v) => (v > 0 ? '+' : '') + f1(v)],
  ['Minutes', (r) => r.min, f1], ['True Shooting', (r) => r.ts, (v) => (v * 100).toFixed(1) + '%', 1],
];

export function Leaders() {
  const league = useLeague();
  const teamGames = Math.max(1, ...Object.values(league.teams).map((t) => t.w + t.l));
  const qualified = Object.values(league.players).filter((p) => p.stats.g >= teamGames * 0.58 && p.stats.g > 0);
  const extra = (p: Player, kind?: number) =>
    kind === 1 ? p.stats.fga >= p.stats.g * 6 : kind === 2 ? p.stats.tpa >= p.stats.g * 2.5 : kind === 3 ? p.stats.fta >= p.stats.g * 2 : true;
  return (
    <div>
      <h2 className="page-title">League leaders <span className="muted small">(min. {Math.ceil(teamGames * 0.58)} games)</span></h2>
      {!qualified.length && <p className="muted">Play some games first.</p>}
      <div className="leaders-grid">
        {qualified.length > 0 && LEADER_CATS.map(([label, f, fmt, kind]) => {
          const top = qualified.filter((p) => extra(p, kind)).map((p) => ({ p, v: f(perGameRow(p.stats)) })).sort((a, b) => b.v - a.v).slice(0, 10);
          return (
            <Card key={label} title={label}>
              {top.map(({ p, v }, i) => (
                <div key={p.id} className={`leader-row ${p.stats.team === league.userTeam ? 'mine' : ''} ${i === 0 ? 'first' : ''}`}>
                  <span className="rank">{i + 1}</span>
                  {i === 0 ? <Headshot p={p} size={44} league={league} /> : null}
                  <PlayerLink league={league} id={p.id} />
                  <TeamBadge league={league} abbr={p.stats.team} size={14} />
                  <span className="leader-val">{fmt(v)}</span>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function Playoffs() {
  const league = useLeague();
  if (!league.series.length) {
    return <Card title="Playoffs"><p className="muted">The playoffs haven't started yet. Projected seeds are on the standings page.</p></Card>;
  }
  const finals = league.series.find((s) => s.round === 4);
  return (
    <div>
      <h2 className="page-title">Playoffs</h2>
      {league.champion && (
        <div className="champion-banner" style={{ background: league.teams[league.champion].colors[0] }}>
          🏆 {league.teams[league.champion].name} are the champions!
        </div>
      )}
      <div className="bracket">
        {(['West', 'East'] as const).map((conf) => (
          <div key={conf} className="bracket-conf">
            <h3>{conf}</h3>
            <div className="bracket-rounds">
              {[0, 1, 2, 3].map((round) => {
                const ss = league.series.filter((s) => s.conf === conf && s.round === round).sort((a, b) => a.slot - b.slot);
                if (!ss.length) return null;
                return (
                  <div key={round} className="bracket-round">
                    <div className="round-label">{round === 0 ? 'Play-In' : ss[0].label}</div>
                    {ss.map((s) => <SeriesBox key={s.id} league={league} s={s} />)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {finals && (
        <div className="finals">
          <div className="round-label">NBA Finals</div>
          <SeriesBox league={league} s={finals} />
        </div>
      )}
    </div>
  );
}

function SeriesBox({ league, s }: { league: League; s: Series }) {
  const row = (abbr: string, seed: number, wins: number) => (
    <div className={`series-team ${s.winner === abbr ? 'won' : s.winner ? 'lost' : ''} ${abbr === league.userTeam ? 'mine' : ''}`}>
      <span className="seed">{seed}</span>
      <TeamBadge league={league} abbr={abbr} size={18} />
      <span className="series-name">{league.teams[abbr]?.name.split(' ').slice(-1)[0]}</span>
      <span className="series-wins">{wins}</span>
    </div>
  );
  return (
    <div className="series-box">
      {row(s.high, s.highSeed, s.winsHigh)}
      {row(s.low, s.lowSeed, s.winsLow)}
      {s.games.length > 0 && (
        <div className="game-chips">
          {s.games.map((g, i) => <button key={g} className="chip" onClick={() => go({ name: 'game', id: g, season: league.season })}>{s.bestOf === 1 ? 'Box' : `G${i + 1}`}</button>)}
        </div>
      )}
    </div>
  );
}
