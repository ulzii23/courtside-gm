import { play } from '../sound';
import { useState } from 'react';
import { ROSTER_MAX, signPlayer, standings, startNextSeason, teamOvr, updateChemistry, userNextGame } from '../engine/league';
import { ovr } from '../engine/ratings';
import { seasonLabel } from '../data/teams';
import { changed, go, useLeague } from '../store';
import { Card, f1, Headshot, Ovr, PlayerLink, perGameRow, TeamBadge, TeamLink, Th, useSort } from './common';

export function Dashboard() {
  const league = useLeague();
  const user = league.teams[league.userTeam];
  const next = userNextGame(league);
  const confRank = standings(league, user.conf).findIndex((t) => t.abbr === user.abbr) + 1;
  const recent = league.schedule.filter((g) => g.played && (g.home === user.abbr || g.away === user.abbr)).slice(-5).reverse();
  const roster = user.roster.map((id) => league.players[id]);
  const leader = (f: (r: ReturnType<typeof perGameRow>) => number) =>
    [...roster].filter((p) => p.stats.g > 0).sort((a, b) => f(perGameRow(b.stats)) - f(perGameRow(a.stats)))[0];
  const userSeries = league.series.filter((s) => (s.high === user.abbr || s.low === user.abbr)).at(-1);
  const lastHistory = league.history.at(-1);

  return (
    <div className="dashboard">
      {league.phase === 'offseason' && (
        <Card title={`${seasonLabel(league.season)} season complete`} className="highlight">
          <p>
            Champion: <TeamLink league={league} abbr={league.champion!} full /> · Your season: {lastHistory?.userRecord}, {lastHistory?.userResult}
          </p>
          {lastHistory?.mvp && <p>MVP: <PlayerLink league={league} id={lastHistory.mvp} /> · DPOY: {lastHistory.dpoy && <PlayerLink league={league} id={lastHistory.dpoy} />} · Finals MVP: {lastHistory.fmvp && <PlayerLink league={league} id={lastHistory.fmvp} />}</p>}
          <p className="muted">Next: players age a year and develop (or decline) based on age and work ethic, veterans may retire, and you'll pick in a rookie draft of new prospects.</p>
          <button className="btn primary big" onClick={() => { startNextSeason(league); changed(); go({ name: 'draft' }); }}>
            Start {seasonLabel(league.season + 1)} offseason →
          </button>
        </Card>
      )}

      <div className="dash-grid">
        <Card title="Your team">
          <div className="dash-team">
            <TeamBadge league={league} abbr={user.abbr} size={48} />
            <div>
              <div className="big-num">{user.w}-{user.l}</div>
              <div className="muted">#{confRank} in the {user.conf} · Team OVR {teamOvr(league, user)} · Chemistry {user.chem}</div>
            </div>
          </div>
          <div className="row-actions">
            <button className="btn" onClick={() => go({ name: 'roster' })}>Lineup & strategy</button>
            <button className="btn ghost" onClick={() => go({ name: 'schedule' })}>Schedule</button>
          </div>
        </Card>

        <Card title={league.phase === 'playoffs' ? 'Playoffs' : 'Next game'}>
          {league.phase === 'regular' && next ? (
            <div className="next-game">
              <TeamBadge league={league} abbr={next.away} size={40} />
              <div className="vs">
                <div>{next.home === user.abbr ? 'vs' : '@'}</div>
                <div className="muted small">Day {next.day + 1}</div>
              </div>
              <TeamBadge league={league} abbr={next.home} size={40} />
              <div className="muted small next-detail">
                {[next.away, next.home].map((a) => `${league.teams[a].name} ${league.teams[a].w}-${league.teams[a].l} (OVR ${teamOvr(league, league.teams[a])})`).join(' at ')}
              </div>
            </div>
          ) : league.phase === 'playoffs' ? (
            userSeries ? (
              <p>{userSeries.label}: <TeamLink league={league} abbr={userSeries.high} full /> {userSeries.winsHigh} – {userSeries.winsLow} <TeamLink league={league} abbr={userSeries.low} full />
                {userSeries.winner && (userSeries.winner === user.abbr ? ' — you advanced!' : ' — eliminated.')}</p>
            ) : <p className="muted">You missed the playoffs. Sim ahead to see who wins it all.</p>
          ) : <p className="muted">No games scheduled.</p>}
          <button className="btn ghost" onClick={() => go({ name: league.phase === 'playoffs' ? 'playoffs' : 'standings' })}>{league.phase === 'playoffs' ? 'Bracket' : 'Standings'}</button>
        </Card>

        <Card title="Recent results">
          {!recent.length && <p className="muted">No games played yet.</p>}
          {recent.map((g) => {
            const home = g.home === user.abbr;
            const my = home ? g.homeScore! : g.awayScore!;
            const their = home ? g.awayScore! : g.homeScore!;
            return (
              <div key={g.id} className="result-row" onClick={() => go({ name: 'game', id: g.id, season: league.season })}>
                <span className={my > their ? 'win' : 'loss'}>{my > their ? 'W' : 'L'}</span>
                <span>{home ? 'vs' : '@'}</span>
                <TeamBadge league={league} abbr={home ? g.away : g.home} size={18} />
                <span>{my}-{their}</span>
                <span className="muted small">box score →</span>
              </div>
            );
          })}
        </Card>

        <Card title="Team leaders">
          {([['PTS', (r) => r.pts], ['REB', (r) => r.reb], ['AST', (r) => r.ast]] as [string, (r: ReturnType<typeof perGameRow>) => number][]).map(([label, f]) => {
            const p = leader(f);
            return p ? (
              <div key={label} className="mini-row">
                <Headshot p={p} size={36} league={league} />
                <PlayerLink league={league} id={p.id} />
                <span className="leader-val">{f1(f(perGameRow(p.stats)))} {label}</span>
              </div>
            ) : null;
          })}
          {!roster.some((p) => p.stats.g > 0) && <p className="muted">Play some games first.</p>}
        </Card>
      </div>

      <Card title="League news" right={<button className="btn small ghost" onClick={() => go({ name: 'news' })}>All news</button>}>
        <ul className="news">{league.news.slice(0, 12).map((n, i) => <li key={i}><span className="muted small">{seasonLabel(n.season)} · day {n.day + 1}</span> {n.text}</li>)}</ul>
      </Card>
    </div>
  );
}

type FAKey = 'ovr' | 'pot' | 'age' | 'name';

export function FreeAgents() {
  const league = useLeague();
  const user = league.teams[league.userTeam];
  const sort = useSort<FAKey>('ovr');
  const [pos, setPos] = useState('All');
  const fas = league.freeAgents.map((id) => league.players[id]).filter((p) => p && (pos === 'All' || p.pos === pos)).sort((a, b) => {
    const v = (p: typeof a) => (sort.key === 'ovr' ? ovr(p.ratings) : sort.key === 'pot' ? p.pot : sort.key === 'age' ? p.age : p.name);
    const va = v(a), vb = v(b);
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
  });
  const full = user.roster.length >= ROSTER_MAX;
  return (
    <Card
      title={`Free agents (${fas.length})`}
      right={
        <div className="filters">
          <span className="muted">Your roster: {user.roster.length}/{ROSTER_MAX}</span>
          <div className="seg">{['All', 'PG', 'SG', 'SF', 'PF', 'C'].map((p) => <button key={p} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p}</button>)}</div>
        </div>
      }
    >
      {full && <p className="warn-text">Your roster is full. Release someone from the Lineup page to sign a free agent.</p>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th></th><Th k="name" sort={sort}>Player</Th><th>Pos</th><Th k="age" sort={sort}>Age</Th><Th k="ovr" sort={sort}>OVR</Th><Th k="pot" sort={sort}>POT</Th><th>Ego</th><th></th></tr></thead>
          <tbody>
            {fas.slice(0, 150).map((p) => (
              <tr key={p.id}>
                <td><Headshot p={p} size={32} /></td>
                <td><PlayerLink league={league} id={p.id} /></td><td>{p.pos}</td><td>{p.age}</td><td><Ovr p={p} /></td><td>{p.pot}</td><td>{p.personality.ego}</td>
                <td><button className="btn small primary" disabled={full} onClick={() => { signPlayer(league, user.abbr, p.id); updateChemistry(league, user); play('sign'); changed(); }}>Sign</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function History() {
  const league = useLeague();
  return (
    <Card title="League history">
      {!league.history.length && <p className="muted">Finish a season to see its champion and awards here.</p>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Season</th><th>Champion</th><th>Runner-up</th><th>MVP</th><th>DPOY</th><th>Finals MVP</th><th>Your team</th></tr></thead>
          <tbody>
            {[...league.history].reverse().map((h) => (
              <tr key={h.season}>
                <td>{seasonLabel(h.season)}</td>
                <td>{h.champion ? <TeamLink league={league} abbr={h.champion} full /> : '—'}</td>
                <td>{h.runnerUp ? <TeamLink league={league} abbr={h.runnerUp} full /> : '—'}</td>
                <td>{h.mvp && <PlayerLink league={league} id={h.mvp} />}</td>
                <td>{h.dpoy && <PlayerLink league={league} id={h.dpoy} />}</td>
                <td>{h.fmvp && <PlayerLink league={league} id={h.fmvp} />}</td>
                <td>{h.userRecord} · {h.userResult}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {league.history.at(-1)?.allLeague && (
        <>
          <h4>All-League 1st Team ({seasonLabel(league.history.at(-1)!.season)})</h4>
          <div className="all-league">
            {league.history.at(-1)!.allLeague!.map((id) => league.players[id] && (
              <div key={id} className="all-league-card" onClick={() => go({ name: 'player', id })}>
                <Headshot p={league.players[id]} size={64} league={league} />
                <span>{league.players[id].name}</span>
                <Ovr p={league.players[id]} />
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

export function News() {
  const league = useLeague();
  return (
    <Card title="News">
      <ul className="news">{league.news.map((n, i) => <li key={i}><span className="muted small">{seasonLabel(n.season)} · day {n.day + 1}</span> {n.text}</li>)}</ul>
    </Card>
  );
}
