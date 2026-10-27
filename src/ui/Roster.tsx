import { autoRotation, normalizeMinutes, releasePlayer, ROSTER_MIN, teamOvr, updateChemistry } from '../engine/league';
import { ovr, statFrom } from '../engine/ratings';
import { changed, go, useLeague } from '../store';
import type { DefenseSystem, OffenseSystem, Pace, Team } from '../types';
import { roleSummary } from './OffenseRole';
import { Bar, Card, f1, formLabel, Headshot, moraleLabel, Ovr, PlayerLink, perGameRow, rColor, TeamBadge } from './common';

export const OFFENSES: Record<OffenseSystem, [string, string]> = {
  balanced: ['Balanced', 'No special emphasis. Safe for any roster.'],
  'pace-space': ['Pace & Space', 'More threes, a bit faster. Strong when your shooters are good (Three Point rating).'],
  'inside-out': ['Inside-Out', 'Pound the paint: fewer threes, more free throws and offensive rebounds. Slower pace.'],
  heliocentric: ['Heliocentric', 'Run everything through your go-to player. Great with one elite creator.'],
  motion: ['Motion', 'Ball movement: more assists, fewer turnovers, shots spread out. Rewards good passers.'],
  'run-gun': ['Run & Gun', 'Push the pace hard: easier looks in transition, more turnovers, more fatigue.'],
  'pick-roll': ['Pick & Roll', 'Screens for the ball handler: more drives and pull-up jumpers. Best with an elite passer.'],
  'post-up': ['Post-Up', 'Feed the bigs on the block: lots of post-ups and free throws, fewer threes, slower pace.'],
  iso: ['Isolation', 'Clear out for your best scorers: fewer turnovers and assists, lots of mid-range.'],
};

export const DEFENSES: Record<DefenseSystem, [string, string]> = {
  man: ['Man-to-Man', 'Standard defense.'],
  switch: ['Switch Everything', 'Takes away threes if your defenders are good; slightly worse on the glass.'],
  drop: ['Drop / Protect the Paint', 'Big man sits back: fewer points inside, but opponents shoot more threes.'],
  zone: ['2-3 Zone', 'Walls off the paint; gives up threes and offensive rebounds.'],
  press: ['Full-Court Press', 'Forces turnovers and speeds the game up, but tires your players and allows easy layups.'],
};

const PACES: Record<Pace, string> = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];

export function Roster({ teamAbbr }: { teamAbbr?: string }) {
  const league = useLeague();
  const abbr = teamAbbr ?? league.userTeam;
  const team = league.teams[abbr];
  const mine = abbr === league.userTeam;
  const editable = mine && !team.autoLineup;
  const total = team.roster.reduce((s, id) => s + (team.minutes[id] ?? 0), 0);

  const update = (fn: (t: Team) => void) => {
    fn(team);
    updateChemistry(league, team);
    changed();
  };
  const move = (i: number, dir: -1 | 1) => update((t) => {
    const j = i + dir;
    if (j < 0 || j >= t.roster.length) return;
    [t.roster[i], t.roster[j]] = [t.roster[j], t.roster[i]];
  });

  const captain = team.strategy.captain ? league.players[team.strategy.captain] : null;
  const egos = team.roster.map((id) => league.players[id]).filter((p) => p.personality.ego >= 75 && (team.minutes[p.id] ?? 0) >= 10);

  return (
    <div className="roster">
      <div className="team-header" style={{ background: `linear-gradient(110deg, ${team.colors[0]} 0%, ${team.colors[0]}cc 55%, ${team.colors[1]} 140%)` }}>
        <TeamBadge league={league} abbr={abbr} size={44} />
        <div>
          <h2>{team.name}</h2>
          <div>{team.w}-{team.l} · {team.conf}ern Conference · Team OVR {teamOvr(league, team)}</div>
        </div>
        <div className="team-header-right">
          <div className="chem">
            <span>Chemistry</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${team.chem}%`, background: team.chem >= 70 ? '#22c55e' : team.chem >= 50 ? '#eab308' : '#ef4444' }} /></div>
            <strong>{team.chem}</strong>
          </div>
          {!mine && <button className="btn" onClick={() => go({ name: 'schedule', team: abbr })}>Schedule</button>}
        </div>
      </div>

      <div className="roster-grid">
        <Card
          title={mine ? 'Rotation' : 'Roster'}
          right={mine && (
            <div className="row-actions">
              <label className="toggle">
                <input type="checkbox" checked={team.autoLineup} onChange={(e) => update((t) => { t.autoLineup = e.target.checked; if (t.autoLineup) autoRotation(league, t, false); })} />
                Assistant coach manages rotation
              </label>
              <button className="btn small" onClick={() => update((t) => autoRotation(league, t, false))}>Auto-set</button>
            </div>
          )}
        >
          {mine && <p className="muted small">The first five are your starters. Use ▲▼ to change the order and set each player's target minutes (the total should be 240). Injured players are skipped automatically and their minutes go to the rest of the rotation.</p>}
          <div className="table-wrap">
            <table className="tbl roster-tbl">
              <thead>
                <tr>
                  <th></th><th></th><th>Player</th><th title="Target minutes per game">MIN</th>{mine && <th></th>}<th>Pos</th><th>Age</th><th>OVR</th><th>POT</th>
                  <th title="Minutes he can play before fatigue sets in">Stam.</th>
                  <th>Morale</th>
                  <th title="Ego: high-ego players want minutes and shots">Ego</th>
                  <th title="Offensive role (set it on the player's page)">Role</th>
                  <th>GP</th><th>PTS</th><th>REB</th><th>AST</th>
                </tr>
              </thead>
              <tbody>
                {team.roster.map((id, i) => {
                  const p = league.players[id];
                  const s = perGameRow(p.stats);
                  const [ml, mc] = moraleLabel(p.morale);
                  return (
                    <tr key={id} className={i === 4 ? 'starter-break' : i < 5 ? 'starter' : ''}>
                      <td className="slot">{i < 5 ? SLOTS[i] : i + 1}</td>
                      <td><Headshot p={p} size={34} league={league} /></td>
                      <td>
                        <PlayerLink league={league} id={id} />
                        {team.strategy.captain === id && <span className="tag" title="Captain">C</span>}
                        {team.strategy.closer === id && <span className="tag gold" title="Go-to player">★</span>}
                        {p.tradeRequest && <span className="tag warn" title="Requested a trade">TR</span>}
                        {(() => { const fl = formLabel(p); return fl && <span className="tag" style={{ color: fl[1] }} title={fl[2]}>{fl[0]}</span>; })()}
                        {p.injury && <div className="inj-text">{p.injury.type} · {p.injury.games}g</div>}
                      </td>
                      <td>
                        {editable ? (
                          <input
                            className="min-input"
                            type="number"
                            min={0}
                            max={48}
                            value={team.minutes[id] ?? 0}
                            onChange={(e) => update((t) => { t.minutes[id] = Math.max(0, Math.min(48, Number(e.target.value) || 0)); })}
                          />
                        ) : (team.minutes[id] ?? 0)}
                      </td>
                      {mine && (
                        <td className="nowrap">
                          {editable && <>
                            <button className="icon-btn" title="Move up" onClick={() => move(i, -1)}>▲</button>
                            <button className="icon-btn" title="Move down" onClick={() => move(i, 1)}>▼</button>
                          </>}
                          <button
                            className="icon-btn danger"
                            title="Release"
                            disabled={team.roster.length <= ROSTER_MIN}
                            onClick={() => { if (confirm(`Release ${p.name}?`)) { releasePlayer(league, abbr, id); updateChemistry(league, team); changed(); } }}
                          >✕</button>
                        </td>
                      )}
                      <td>{p.pos}</td>
                      <td>{p.age}</td>
                      <td className="nowrap">
                        <Ovr p={p} />
                        {!!p.seasonDelta && <small style={{ color: p.seasonDelta > 0 ? 'var(--win)' : 'var(--loss)' }} title="OVR change this season"> {p.seasonDelta > 0 ? '+' : ''}{p.seasonDelta}</small>}
                      </td>
                      <td>{p.pot}</td>
                      <td>{Math.round(statFrom('sta', p.ratings.sta))}m</td>
                      <td><span style={{ color: mc }} title={`${Math.round(p.morale)}/100 — expects ~${Math.round(p.expMin)} min`}>{ml}</span></td>
                      <td><span className="rating-num" style={{ color: rColor(100 - p.personality.ego) }}>{p.personality.ego}</span></td>
                      <td className="nowrap">{mine ? <a className="player-link" onClick={() => go({ name: 'player', id })}>{roleSummary(p.focus)}</a> : roleSummary(p.focus)}</td>
                      <td>{s.g}</td><td>{f1(s.pts)}</td><td>{f1(s.reb)}</td><td>{f1(s.ast)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editable && (
            <div className={`minutes-total ${total === 240 ? 'ok' : 'warn'}`}>
              Total minutes: <strong>{total}</strong> / 240
              {total !== 240 && <button className="btn small" onClick={() => update((t) => normalizeMinutes(t))}>Scale to 240</button>}
              {total !== 240 && <span className="muted small"> (the game scales it automatically if you don't)</span>}
            </div>
          )}
        </Card>

        <div className="side-col">
          <Card title="Game plan">
            <MultiPick
              label="Offense" disabled={!mine} value={team.strategy.offense} options={OFFENSES}
              onChange={(v) => update((t) => { t.strategy.offense = v as OffenseSystem[]; })}
            />
            <MultiPick
              label="Defense" disabled={!mine} value={team.strategy.defense} options={DEFENSES}
              onChange={(v) => update((t) => { t.strategy.defense = v as DefenseSystem[]; })}
            />
            <Select
              label="Pace" disabled={!mine} value={team.strategy.pace}
              options={Object.entries(PACES)}
              onChange={(v) => update((t) => { t.strategy.pace = v as Pace; })}
            />
            <Select
              label="Team captain" disabled={!mine} value={team.strategy.captain ?? ''}
              options={[['', '— none —'], ...team.roster.map((id) => [id, `${league.players[id].name} (LDR ${league.players[id].personality.lead})`] as [string, string])]}
              onChange={(v) => update((t) => { t.strategy.captain = v || null; })}
              hint="A strong leader keeps morale up and improves team chemistry."
            />
            <Select
              label="Go-to player (clutch)" disabled={!mine} value={team.strategy.closer ?? ''}
              options={[['', '— auto —'], ...team.roster.map((id) => [id, `${league.players[id].name} (CLU ${league.players[id].personality.clutch})`] as [string, string])]}
              onChange={(v) => update((t) => { t.strategy.closer = v || null; })}
              hint="Gets the ball in close games late, and is the focus of a Heliocentric offense."
            />
          </Card>
          <Card title="Locker room">
            <Bar label="Chemistry" value={team.chem} />
            <ul className="notes">
              <li>Captain: {captain ? <><PlayerLink league={league} id={captain.id} /> (Leadership {captain.personality.lead})</> : <span className="warn-text">none — pick one!</span>}</li>
              <li>Average morale: {Math.round(team.roster.reduce((s, id) => s + league.players[id].morale, 0) / Math.max(1, team.roster.length))}</li>
              {egos.length >= 2 && <li className="warn-text">Ego clash: {egos.map((p) => p.name).join(', ')} all want the ball.</li>}
              {team.roster.filter((id) => league.players[id].morale < 40).map((id) => (
                <li key={id} className="warn-text">{league.players[id].name} is unhappy (expects ~{Math.round(league.players[id].expMin)} min).</li>
              ))}
            </ul>
          </Card>
          <Card title="Top players">
            {[...team.roster].sort((a, b) => ovr(league.players[b].ratings) - ovr(league.players[a].ratings)).slice(0, 3).map((id) => (
              <div key={id} className="mini-row"><Headshot p={league.players[id]} size={30} league={league} /><PlayerLink league={league} id={id} /><Ovr p={league.players[id]} /></div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

const MAX_SYSTEMS = 3;

// Pick one to three systems; the team mixes them up from possession to possession.
function MultiPick({ label, value, options, onChange, disabled }: {
  label: string; value: string[]; options: Record<string, [string, string]>; onChange: (v: string[]) => void; disabled?: boolean;
}) {
  const toggle = (k: string) => {
    if (value.includes(k)) { if (value.length > 1) onChange(value.filter((x) => x !== k)); }
    else if (value.length < MAX_SYSTEMS) onChange([...value, k]);
  };
  return (
    <div className="field">
      <span>{label} <small className="muted">(up to {MAX_SYSTEMS}, mixed each possession)</small></span>
      <div className="role-presets">
        {Object.entries(options).map(([k, [l, hint]]) => (
          <button
            key={k} title={hint} className={`chip ${value.includes(k) ? 'on' : ''}`}
            disabled={disabled || (!value.includes(k) && value.length >= MAX_SYSTEMS)}
            onClick={() => toggle(k)}
          >{l}</button>
        ))}
      </div>
      <ul className="notes small">
        {value.map((k) => <li key={k}><strong>{options[k][0]}</strong>{value.length > 1 && ` (${Math.round(100 / value.length)}%)`}: <span className="muted">{options[k][1]}</span></li>)}
      </ul>
    </div>
  );
}

function Select({ label, value, options, onChange, hint, disabled }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void; hint?: string; disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
