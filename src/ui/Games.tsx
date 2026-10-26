import { useEffect, useState } from 'react';
import { loadGame } from '../db';
import { go, useLeague } from '../store';
import type { BoxTeam, GameResult } from '../types';
import { Card, PlayerLink, TeamBadge, TeamLink } from './common';

export function Schedule({ teamAbbr }: { teamAbbr?: string }) {
  const league = useLeague();
  const abbr = teamAbbr ?? league.userTeam;
  const team = league.teams[abbr];
  const games = league.schedule.filter((g) => g.home === abbr || g.away === abbr);
  const playoffGames = league.series.filter((s) => s.high === abbr || s.low === abbr);

  return (
    <div>
      <h2 className="page-title"><TeamBadge league={league} abbr={abbr} /> {team.name} schedule <span className="muted">({team.w}-{team.l})</span></h2>
      {playoffGames.length > 0 && (
        <Card title="Playoffs">
          {playoffGames.map((s) => (
            <div key={s.id} className="series-line">
              <strong>{s.label}</strong> vs <TeamLink league={league} abbr={s.high === abbr ? s.low : s.high} full />
              <span className="muted"> {s.high === abbr ? s.winsHigh : s.winsLow}-{s.high === abbr ? s.winsLow : s.winsHigh}</span>
              <div className="game-chips">
                {s.games.map((gid, i) => <button key={gid} className="chip" onClick={() => go({ name: 'game', id: gid, season: league.season })}>G{i + 1}</button>)}
              </div>
            </div>
          ))}
        </Card>
      )}
      <Card title="Regular season">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th>Day</th><th>Opponent</th><th>Result</th><th></th></tr></thead>
            <tbody>
              {games.map((g, i) => {
                const home = g.home === abbr;
                const opp = home ? g.away : g.home;
                const my = home ? g.homeScore : g.awayScore;
                const their = home ? g.awayScore : g.homeScore;
                const won = g.played && my! > their!;
                return (
                  <tr key={g.id} className={g.played ? '' : 'future'}>
                    <td>{i + 1}</td>
                    <td>{g.day + 1}</td>
                    <td>{home ? 'vs' : '@'} <TeamLink league={league} abbr={opp} full /></td>
                    <td>{g.played ? <span className={won ? 'win' : 'loss'}>{won ? 'W' : 'L'} {my}-{their}</span> : '—'}</td>
                    <td>{g.played && <button className="btn small" onClick={() => go({ name: 'game', id: g.id, season: league.season })}>Box score</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function BoxScore({ id, season }: { id: number; season: number }) {
  const league = useLeague();
  const [game, setGame] = useState<GameResult | null | undefined>(undefined);
  useEffect(() => {
    loadGame(league.id, season, id).then((g) => setGame(g ?? null));
  }, [league.id, id, season]);
  if (game === undefined) return <p className="muted">Loading…</p>;
  if (game === null) return <Card title="Box score unavailable"><p>This game's box score wasn't saved.</p></Card>;

  const periods = Math.max(game.home.quarters.length, game.away.quarters.length);
  const pLabel = (i: number) => (i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `${i - 3}OT`);
  const winner = game.home.score > game.away.score ? game.home.abbr : game.away.abbr;

  return (
    <div className="boxscore">
      <div className="score-hero">
        {[game.away, game.home].map((t, i) => (
          <div key={t.abbr} className={`score-team ${winner === t.abbr ? 'won' : ''}`}>
            <TeamBadge league={league} abbr={t.abbr} size={40} />
            <div>
              <div className="score-name">{league.teams[t.abbr]?.name ?? t.abbr}</div>
              <div className="muted small">{i === 0 ? 'Away' : 'Home'}</div>
            </div>
            <div className="score-big">{t.score}</div>
          </div>
        ))}
        <div className="score-meta muted">{game.playoff ?? `Regular season · Day ${game.day + 1}`}{game.ot ? ` · ${game.ot > 1 ? `${game.ot}OT` : 'OT'}` : ''}</div>
      </div>

      <Card title="Line score">
        <table className="tbl line-score">
          <thead><tr><th></th>{Array.from({ length: periods }, (_, i) => <th key={i}>{pLabel(i)}</th>)}<th>T</th></tr></thead>
          <tbody>
            {[game.away, game.home].map((t) => (
              <tr key={t.abbr}><td><TeamBadge league={league} abbr={t.abbr} size={18} /></td>
                {Array.from({ length: periods }, (_, i) => <td key={i}>{t.quarters[i] ?? 0}</td>)}
                <td><strong>{t.score}</strong></td></tr>
            ))}
          </tbody>
        </table>
      </Card>

      {[game.away, game.home].map((t) => <TeamBox key={t.abbr} t={t} />)}

      {game.notes.length > 0 && (
        <Card title="Game notes">
          <ul className="notes">{game.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

function TeamBox({ t }: { t: BoxTeam }) {
  const league = useLeague();
  const played = t.lines.filter((l) => !l.dnp).sort((a, b) => Number(b.starter) - Number(a.starter) || b.min - a.min);
  const dnp = t.lines.filter((l) => l.dnp);
  const sum = (k: 'pts' | 'orb' | 'drb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'fgm' | 'fga' | 'tpm' | 'tpa' | 'ftm' | 'fta') => played.reduce((s, l) => s + l[k], 0);
  const mm = (min: number) => `${Math.floor(min)}:${String(Math.round((min % 1) * 60)).padStart(2, '0')}`;
  return (
    <Card title={<><TeamBadge league={league} abbr={t.abbr} size={20} /> {league.teams[t.abbr]?.name ?? t.abbr}</>}>
      <div className="table-wrap">
        <table className="tbl box">
          <thead>
            <tr><th>Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG</th><th>3PT</th><th>FT</th><th>OREB</th><th>PF</th><th>+/-</th></tr>
          </thead>
          <tbody>
            {played.map((l, i) => (
              <tr key={l.id} className={i === 4 ? 'starter-break' : ''}>
                <td><PlayerLink league={league} id={l.id} /> <span className="muted small">{l.starter ? l.pos : ''}</span></td>
                <td>{mm(l.min)}</td><td><strong>{l.pts}</strong></td><td>{l.orb + l.drb}</td><td>{l.ast}</td><td>{l.stl}</td><td>{l.blk}</td><td>{l.tov}</td>
                <td>{l.fgm}-{l.fga}</td><td>{l.tpm}-{l.tpa}</td><td>{l.ftm}-{l.fta}</td><td>{l.orb}</td><td>{l.pf}</td>
                <td className={l.pm > 0 ? 'win' : l.pm < 0 ? 'loss' : ''}>{l.pm > 0 ? `+${l.pm}` : l.pm}</td>
              </tr>
            ))}
            {dnp.map((l) => (
              <tr key={l.id} className="dnp"><td><PlayerLink league={league} id={l.id} /></td><td colSpan={13} className="muted">DNP — {l.dnp}</td></tr>
            ))}
            <tr className="totals">
              <td>Totals</td><td></td><td>{sum('pts')}</td><td>{sum('orb') + sum('drb')}</td><td>{sum('ast')}</td><td>{sum('stl')}</td><td>{sum('blk')}</td><td>{sum('tov')}</td>
              <td>{sum('fgm')}-{sum('fga')}</td><td>{sum('tpm')}-{sum('tpa')}</td><td>{sum('ftm')}-{sum('fta')}</td><td>{sum('orb')}</td><td>{sum('pf')}</td><td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
