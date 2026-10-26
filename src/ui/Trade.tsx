import { useState, type ReactNode } from 'react';
import { ovr } from '../engine/ratings';
import { evaluateTrade, executeTrade, playerValue, tradingOpen } from '../engine/transactions';
import { seasonLabel } from '../data/teams';
import { changed, useLeague } from '../store';
import { play } from '../sound';
import type { League, Team } from '../types';
import { Card, Headshot, Ovr, PlayerLink, TeamBadge, TeamLink } from './common';

export function Trade({ initialTeam, initialGet }: { initialTeam?: string; initialGet?: string }) {
  const league = useLeague();
  const user = league.teams[league.userTeam];
  const others = Object.values(league.teams).filter((t) => t.abbr !== user.abbr).sort((a, b) => a.name.localeCompare(b.name));
  const [partner, setPartner] = useState(initialTeam && initialTeam !== user.abbr ? initialTeam : others[0].abbr);
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>(initialGet ? [initialGet] : []);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const them = league.teams[partner];
  const tw = tradingOpen(league);

  // Drop selections that are no longer on the right roster (after a trade or team change).
  const giveIds = give.filter((id) => user.roster.includes(id));
  const getIds = get.filter((id) => them.roster.includes(id));
  const verdict = evaluateTrade(league, partner, giveIds, getIds);
  const interest = verdict.give > 0 ? Math.min(100, (verdict.get / (verdict.give * 1.05 + 1)) * 100) : giveIds.length ? 100 : 0;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    setResult(null);
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const propose = () => {
    if (verdict.ok) {
      executeTrade(league, user.abbr, partner, giveIds, getIds);
      setGive([]);
      setGet([]);
      changed();
    }
    play(verdict.ok ? 'tradeOk' : 'tradeNo');
    setResult({ ok: verdict.ok, message: verdict.ok ? `${verdict.message} Check your rotation: new players start at 0 minutes.` : verdict.message });
  };

  const blockList = Object.values(league.players).filter((p) => p.tradeRequest && p.stats.team !== 'FA');

  return (
    <div className="trade">
      <div className="draft-bar">
        <h2>Trades</h2>
        <span className={tw.open ? 'muted' : 'warn-text'}>{tw.why}</span>
      </div>

      <div className="trade-grid">
        <RosterPicker league={league} team={user} selected={giveIds} onToggle={(id) => toggle(give, setGive, id)} title="You send" />
        <RosterPicker
          league={league}
          team={them}
          selected={getIds}
          onToggle={(id) => toggle(get, setGet, id)}
          title="You receive"
          header={
            <select value={partner} onChange={(e) => { setPartner(e.target.value); setGet([]); setResult(null); }}>
              {others.map((t) => <option key={t.abbr} value={t.abbr}>{t.name} ({t.w}-{t.l})</option>)}
            </select>
          }
        />
      </div>

      <Card title="Trade summary" className="trade-summary">
        <div className="trade-sides">
          <div>
            <h4>{user.name} send</h4>
            {giveIds.length ? giveIds.map((id) => <div key={id} className="mini-row"><Headshot p={league.players[id]} size={28} league={league} /><span>{league.players[id].name}</span><Ovr p={league.players[id]} /></div>) : <p className="muted">Nothing selected</p>}
          </div>
          <div className="trade-arrow">⇄</div>
          <div>
            <h4>{them.name} send</h4>
            {getIds.length ? getIds.map((id) => <div key={id} className="mini-row"><Headshot p={league.players[id]} size={28} league={league} /><span>{league.players[id].name}</span><Ovr p={league.players[id]} /></div>) : <p className="muted">Nothing selected</p>}
          </div>
        </div>
        <div className="interest">
          <span>{them.name.split(' ').slice(-1)[0]} interest</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${interest}%`, background: interest >= 100 ? '#22c55e' : interest >= 75 ? '#eab308' : '#ef4444' }} /></div>
          <span className="muted small">{interest >= 100 ? 'Likely yes' : interest >= 75 ? 'Close' : 'Not enough'}</span>
        </div>
        <div className="row-actions">
          <button className="btn primary" disabled={!tw.open || (!giveIds.length && !getIds.length)} onClick={propose}>Propose trade</button>
          <button className="btn ghost" onClick={() => { setGive([]); setGet([]); setResult(null); }}>Clear</button>
        </div>
        {result && <p className={result.ok ? 'win' : 'warn-text'}>{result.message}</p>}
        <p className="muted small">AI teams value overall rating most, give young players credit for potential, discount older players and long injuries, and are happy to move players who asked for a trade.</p>
      </Card>

      <div className="two-col">
        <Card title="Trade requests">
          {!blockList.length && <p className="muted">No players have asked for a trade.</p>}
          {blockList.map((p) => (
            <div key={p.id} className="mini-row">
              <Headshot p={p} size={30} league={league} />
              <PlayerLink league={league} id={p.id} />
              <TeamBadge league={league} abbr={p.stats.team} size={16} />
              <Ovr p={p} />
            </div>
          ))}
        </Card>
        <Card title="Recent trades">
          {!league.trades.length && <p className="muted">No trades yet.</p>}
          {[...league.trades].reverse().slice(0, 12).map((t, i) => (
            <div key={i} className="trade-log">
              <span className="muted small">{seasonLabel(t.season)} · day {t.day + 1}</span>
              <div><TeamLink league={league} abbr={t.teams[0]} /> send {t.sent[0].map((id) => league.players[id]?.name ?? 'retired').join(', ') || 'nothing'}</div>
              <div><TeamLink league={league} abbr={t.teams[1]} /> send {t.sent[1].map((id) => league.players[id]?.name ?? 'retired').join(', ') || 'nothing'}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function RosterPicker({ league, team, selected, onToggle, title, header }: {
  league: League; team: Team; selected: string[]; onToggle: (id: string) => void; title: string; header?: ReactNode;
}) {
  const players = team.roster.map((id) => league.players[id]).sort((a, b) => ovr(b.ratings) - ovr(a.ratings));
  return (
    <Card title={<><TeamBadge league={league} abbr={team.abbr} size={22} /> {title}</>} right={header}>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th></th><th></th><th>Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>POT</th><th title="Trade value">Value</th></tr></thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className={selected.includes(p.id) ? 'selected-row' : ''} onClick={() => onToggle(p.id)} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" readOnly checked={selected.includes(p.id)} /></td>
                <td><Headshot p={p} size={30} league={league} /></td>
                <td>
                  <span onClick={(e) => e.stopPropagation()}><PlayerLink league={league} id={p.id} /></span>
                  {p.tradeRequest && <span className="tag warn" title="Requested a trade">TR</span>}
                  {p.injury && <span className="inj-text"> {p.injury.games}g</span>}
                </td>
                <td>{p.pos}</td><td>{p.age}</td><td><Ovr p={p} /></td><td>{p.pot}</td>
                <td>{Math.round(playerValue(p))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
