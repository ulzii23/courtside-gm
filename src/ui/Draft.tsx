import { useEffect, useMemo, useState } from 'react';
import { aiPick, autoDraftRest, autoPickUser, currentPicker, finishDraft, makePick, setDraftSlot, simDraftToUser } from '../engine/league';
import { ovr } from '../engine/ratings';
import { seasonLabel } from '../data/teams';
import { changed, go, useLeague } from '../store';
import type { DraftState, League, Player } from '../types';
import { Card, Headshot, Ovr, PlayerLink, rColor, TeamBadge } from './common';
import { play } from '../sound';
import { BASE_COLS, PERSONALITY_COLS, POS, RATING_COLS, STAT_COLS, type Mode } from './draftColumns';

const AI_PICK_MS = 550;
type Tab = 'players' | 'board' | 'team';

export function Draft() {
  const league = useLeague();
  const d = league.draft;
  if (!d) {
    return (
      <Card title="Draft complete">
        <p>The draft is over.</p>
        <button className="btn primary" onClick={() => go({ name: 'roster' })}>Set your lineup</button>
      </Card>
    );
  }
  if (!d.started) return <DraftSetup league={league} d={d} />;
  return <DraftRoom league={league} d={d} />;
}

// ---------------------------------------------------------------- pre-draft setup

function DraftSetup({ league, d }: { league: League; d: DraftState }) {
  const [slot, setSlot] = useState(0);
  const teams = Object.keys(league.teams).length;
  const round1 = d.order.slice(0, teams);
  const mySlot = round1.indexOf(league.userTeam) + 1;

  return (
    <div className="draft">
      <h2>{seasonLabel(league.season)} Fantasy Draft — Setup</h2>
      <div className="two-col">
        <Card title="Draft settings">
          <label className="field">
            <span>Your draft position</span>
            <select value={slot} onChange={(e) => { const s = Number(e.target.value); setSlot(s); setDraftSlot(league, s); changed(); }}>
              <option value={0}>Random</option>
              {Array.from({ length: teams }, (_, i) => <option key={i} value={i + 1}>Pick {i + 1}</option>)}
            </select>
            <small className="muted">Snake draft: the order reverses every round, so pick 1 in round 1 picks last in round 2.</small>
          </label>
          {slot === 0 && <button className="btn small" onClick={() => { setDraftSlot(league, 0); changed(); }}>Re-shuffle order</button>}
          <label className="field" style={{ marginTop: 12 }}>
            <span>Pick timer</span>
            <select value={d.timer ?? 60} onChange={(e) => { d.timer = Number(e.target.value); changed(); }}>
              <option value={0}>No timer</option>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
            </select>
            <small className="muted">If the clock runs out, you get the top player in your queue, or the best available player.</small>
          </label>
          <p>{Math.round(d.order.length / teams)} rounds · {teams} teams · You pick <strong>#{mySlot}</strong> in round 1 and <strong>#{teams - mySlot + 1}</strong> in round 2.</p>
          <button className="btn primary big" onClick={() => { d.started = true; changed(); }}>Start draft</button>
        </Card>
        <Card title="Round 1 order">
          <ol className="order-list">
            {round1.map((abbr) => (
              <li key={abbr} className={abbr === league.userTeam ? 'mine' : ''}>
                <TeamBadge league={league} abbr={abbr} size={20} /> {league.teams[abbr].name}{abbr === league.userTeam ? ' (you)' : ''}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- live draft

function DraftRoom({ league, d }: { league: League; d: DraftState }) {
  const [tab, setTab] = useState<Tab>('players');
  const [paused, setPaused] = useState(false);
  const [clock, setClock] = useState({ pick: d.pick, left: d.timer ?? 0 });

  const picker = currentPicker(league);
  const done = picker === null;
  const userTurn = picker === league.userTeam;
  const teams = Object.keys(league.teams).length;

  // AI teams pick one at a time, like a live draft.
  useEffect(() => {
    if (done || userTurn || paused) return;
    const t = window.setTimeout(() => { aiPick(league); play('aiPick'); changed(); }, AI_PICK_MS);
    return () => clearTimeout(t);
  }, [d.pick, done, userTurn, paused, league]);

  // Alert when it becomes the user's turn.
  useEffect(() => {
    if (userTurn) play('onClock');
  }, [userTurn, d.pick]);

  // Pick clock for the user. The clock is tied to a pick number so it restarts on every new pick.
  const secondsLeft = clock.pick === d.pick ? clock.left : d.timer ?? 0;
  useEffect(() => {
    if (!userTurn || !d.timer || paused) return;
    if (secondsLeft <= 0) {
      autoPickUser(league);
      play('draft');
      changed();
      return;
    }
    if (secondsLeft <= 10) play('tick');
    const t = window.setTimeout(() => setClock({ pick: d.pick, left: secondsLeft - 1 }), 1000);
    return () => clearTimeout(t);
  }, [userTurn, secondsLeft, d.timer, d.pick, paused, league]);

  const draft = (id: string) => {
    if (!userTurn) return;
    makePick(league, id);
    play('draft');
    changed();
  };
  const toggleQueue = (id: string) => {
    d.queue ??= [];
    d.queue = d.queue.includes(id) ? d.queue.filter((x) => x !== id) : [...d.queue, id];
    changed();
  };

  const myNext = d.order.findIndex((t, i) => i >= d.pick && t === league.userTeam);
  const picksAway = myNext >= 0 ? myNext - d.pick : -1;
  const upNext = d.order.slice(d.pick, d.pick + 12).map((abbr, i) => ({ abbr, n: d.pick + i }));

  return (
    <div className="draft">
      <div className={`clock-bar ${userTurn ? 'my-turn' : ''}`}>
        {done ? (
          <div className="clock-main"><h2>Draft complete</h2><span className="muted">All {d.order.length} picks are in.</span></div>
        ) : (
          <div className="clock-main">
            <TeamBadge league={league} abbr={picker!} size={44} />
            <div>
              <div className="muted small">Round {Math.floor(d.pick / teams) + 1} · Pick {(d.pick % teams) + 1} · Overall #{d.pick + 1}</div>
              <h2>{userTurn ? "You're on the clock!" : `${league.teams[picker!].name} are picking…`}</h2>
              <div className="muted small">
                {userTurn ? 'Click Draft on a player below.' : picksAway > 0 ? `Your next pick is in ${picksAway} pick${picksAway > 1 ? 's' : ''} (round ${Math.floor(myNext / teams) + 1}, pick ${(myNext % teams) + 1}).` : 'You have no picks left.'}
              </div>
            </div>
            {userTurn && !!d.timer && <div className={`countdown ${secondsLeft <= 10 ? 'urgent' : ''}`}>{secondsLeft}</div>}
          </div>
        )}
        <div className="row-actions">
          {!done && <button className="btn" onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '⏸ Pause'}</button>}
          {!done && !userTurn && <button className="btn" onClick={() => { simDraftToUser(league); changed(); }}>Sim to my pick</button>}
          {!done && userTurn && <button className="btn" onClick={() => { autoPickUser(league); play('draft'); changed(); }}>Auto-pick</button>}
          {!done && <button className="btn ghost" onClick={() => { if (confirm('Let the AI make all your remaining picks?')) { autoDraftRest(league); changed(); } }}>Auto-draft rest</button>}
          {done && <button className="btn primary" onClick={() => { finishDraft(league); changed(); go({ name: 'roster' }); }}>Start the season →</button>}
        </div>
      </div>

      {!done && (
        <div className="up-next">
          <span className="muted small">UP NEXT</span>
          {upNext.map(({ abbr, n }) => (
            <div key={n} className={`up-next-pick ${abbr === league.userTeam ? 'mine' : ''} ${n === d.pick ? 'now' : ''}`}>
              <TeamBadge league={league} abbr={abbr} size={22} />
              <span>{Math.floor(n / teams) + 1}.{(n % teams) + 1}</span>
            </div>
          ))}
        </div>
      )}

      <div className="seg tabs">
        <button className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>Players</button>
        <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>Draft Board</button>
        <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>My Team</button>
      </div>

      <div className="draft-grid">
        {tab === 'players' && <PlayerPool league={league} d={d} userTurn={userTurn} onDraft={draft} onQueue={toggleQueue} />}
        {tab === 'board' && <DraftBoard league={league} d={d} />}
        {tab === 'team' && <MyTeam league={league} />}

        <div className="draft-side">
          <Card title={`My queue (${d.queue?.length ?? 0})`}>
            {!d.queue?.length && <p className="muted small">Click ☆ next to a player to queue him. Auto-pick and the pick clock take your queue first.</p>}
            {d.queue?.map((id, i) => {
              const p = league.players[id];
              return (
                <div key={id} className="mini-row">
                  <span className="muted pick-no">{i + 1}</span>
                  <PlayerLink league={league} id={id} />
                  <Ovr p={p} />
                  <button className="icon-btn" title="Move up" onClick={() => { if (i > 0) { [d.queue![i - 1], d.queue![i]] = [d.queue![i], d.queue![i - 1]]; changed(); } }}>▲</button>
                  <button className="icon-btn danger" title="Remove" onClick={() => toggleQueue(id)}>✕</button>
                  {userTurn && <button className="btn small primary" onClick={() => draft(id)}>Draft</button>}
                </div>
              );
            })}
          </Card>
          <Card title="Recent picks">
            {[...d.picks].reverse().slice(0, 15).map((pk) => (
              <div key={pk.pick} className={`mini-row ${pk.team === league.userTeam ? 'mine-row' : ''}`}>
                <span className="muted pick-no">{Math.floor(pk.pick / teams) + 1}.{(pk.pick % teams) + 1}</span>
                <TeamBadge league={league} abbr={pk.team} size={16} />
                <PlayerLink league={league} id={pk.player} />
                <Ovr p={league.players[pk.player]} />
              </div>
            ))}
            {!d.picks.length && <p className="muted small">No picks yet.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function PlayerPool({ league, d, userTurn, onDraft, onQueue }: {
  league: League; d: DraftState; userTurn: boolean; onDraft: (id: string) => void; onQueue: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [pos, setPos] = useState('All');
  const [mode, setMode] = useState<Mode>(d.rookie ? 'ratings' : 'stats');
  const [sortKey, setSortKey] = useState(d.rookie ? 'pot' : 'ovr');
  const [dir, setDir] = useState<1 | -1>(-1);
  const modeCols = mode === 'stats' && !d.rookie ? STAT_COLS : mode === 'personality' ? PERSONALITY_COLS : RATING_COLS;
  const cols = [...BASE_COLS, ...modeCols];

  const pool = useMemo(() => {
    const col = cols.find((c) => c.key === sortKey);
    return d.pool
      .map((id) => league.players[id])
      .filter((p) => (pos === 'All' || p.pos === pos) && p.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => (col ? (col.get(a) - col.get(b)) * dir : a.name.localeCompare(b.name) * dir))
      .slice(0, 200);
  }, [d.pool, d.pool.length, pos, q, sortKey, dir, mode, league.players]);

  const sortBy = (k: string) => {
    if (k === sortKey) setDir((x) => (x === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === 'age' || k === 'tov' || k === 'ego' || k === 'temper' ? 1 : -1); }
  };

  return (
    <Card
      title={userTurn ? "You're on the clock — pick a player" : 'Available players'}
      className={userTurn ? 'on-clock' : ''}
      right={
        <div className="filters">
          <div className="seg view-seg">
            {!d.rookie && <button className={mode === 'stats' ? 'on' : ''} onClick={() => setMode('stats')}>Stats</button>}
            <button className={mode === 'ratings' ? 'on' : ''} onClick={() => setMode('ratings')}>Ratings</button>
            <button className={mode === 'personality' ? 'on' : ''} onClick={() => setMode('personality')}>Personality</button>
          </div>
          <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="seg">{POS.map((p) => <button key={p} className={pos === p ? 'on' : ''} onClick={() => setPos(p)}>{p}</button>)}</div>
        </div>
      }
    >
      {mode === 'stats' && !d.rookie && <p className="muted small">Real per-game stats from {seasonLabel(league.baseSeason)}. Hover a column header for its full name.</p>}
      <div className="table-wrap">
        <table className="tbl draft-tbl">
          <thead>
            <tr>
              <th></th><th></th><th></th>
              <th className="sortable" onClick={() => sortBy('name')}>Player</th>
              <th>Pos</th>
              {cols.map((c) => (
                <th key={c.key} title={c.title} className={`sortable ${sortKey === c.key ? 'active' : ''}`} onClick={() => sortBy(c.key)}>
                  {c.label}{sortKey === c.key ? (dir === -1 ? ' ▾' : ' ▴') : ''}
                </th>
              ))}
              {!d.rookie && <th title="Real team that season">Team</th>}
            </tr>
          </thead>
          <tbody>
            {pool.map((p) => {
              const queued = d.queue?.includes(p.id);
              return (
                <tr key={p.id}>
                  <td><button className="btn small primary" disabled={!userTurn} title={userTurn ? 'Draft this player' : 'Wait for your turn'} onClick={() => onDraft(p.id)}>Draft</button></td>
                  <td><button className={`icon-btn star ${queued ? 'on' : ''}`} title={queued ? 'Remove from queue' : 'Add to queue'} onClick={() => onQueue(p.id)}>{queued ? '★' : '☆'}</button></td>
                  <td><Headshot p={p} size={34} /></td>
                  <td><PlayerLink league={league} id={p.id} /></td>
                  <td>{p.pos}</td>
                  {cols.map((c) => <td key={c.key}>{c.show(p)}</td>)}
                  {!d.rookie && <td>{p.realTeam ?? '—'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Rounds down the side, teams across the top (in round-1 order), like a Yahoo draft board.
function DraftBoard({ league, d }: { league: League; d: DraftState }) {
  const teamCount = Object.keys(league.teams).length;
  const columns = d.order.slice(0, teamCount);
  const rounds = Math.ceil(d.order.length / teamCount);
  const byPick = new Map(d.picks.map((p) => [p.pick, p.player]));
  // cell[round][team] = overall pick number
  const cell: Record<number, Record<string, number>> = {};
  d.order.forEach((abbr, k) => {
    const r = Math.floor(k / teamCount);
    (cell[r] ??= {})[abbr] = k;
  });
  const posColor: Record<string, string> = { PG: '#3b82f6', SG: '#06b6d4', SF: '#22c55e', PF: '#eab308', C: '#f97316' };

  return (
    <Card title="Draft board">
      <div className="board-wrap">
        <table className="board">
          <thead>
            <tr>
              <th>Rd</th>
              {columns.map((abbr) => (
                <th key={abbr} className={abbr === league.userTeam ? 'mine' : ''}>
                  <TeamBadge league={league} abbr={abbr} size={22} />
                  <div>{abbr}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rounds }, (_, r) => (
              <tr key={r}>
                <td className="board-round">{r + 1}</td>
                {columns.map((abbr) => {
                  const k = cell[r]?.[abbr];
                  const pid = k !== undefined ? byPick.get(k) : undefined;
                  const p: Player | undefined = pid ? league.players[pid] : undefined;
                  return (
                    <td key={abbr} className={`${abbr === league.userTeam ? 'mine' : ''} ${k === d.pick ? 'now' : ''}`}>
                      {p ? (
                        <div className="board-cell" style={{ borderLeftColor: posColor[p.pos] ?? '#64748b' }} onClick={() => go({ name: 'player', id: p.id })}>
                          <span className="board-name">{p.name.split(' ').slice(-1)[0]}</span>
                          <span className="board-meta">{p.pos} · <span style={{ color: rColor(ovr(p.ratings)) }}>{ovr(p.ratings)}</span></span>
                        </div>
                      ) : k === d.pick ? <div className="board-cell empty">On clock</div> : <div className="board-cell empty">{k !== undefined ? `#${k + 1}` : ''}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MyTeam({ league }: { league: League }) {
  const user = league.teams[league.userTeam];
  const players = user.roster.map((id) => league.players[id]);
  const count = (set: string[]) => players.filter((p) => set.includes(p.pos)).length;
  return (
    <Card title={`${user.name} (${players.length} players)`}>
      <p className="muted small">Guards: {count(['PG', 'SG'])} · Wings: {count(['SF'])} · Bigs: {count(['PF', 'C'])}</p>
      <table className="tbl">
        <thead><tr><th></th><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>POT</th></tr></thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}><td><Headshot p={p} size={30} /></td><td><PlayerLink league={league} id={p.id} /></td><td>{p.pos}</td><td>{p.age}</td><td><Ovr p={p} /></td><td>{p.pot}</td></tr>
          ))}
        </tbody>
      </table>
      {!players.length && <p className="muted">No players yet.</p>}
    </Card>
  );
}
