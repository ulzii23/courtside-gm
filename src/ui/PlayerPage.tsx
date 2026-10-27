import { play } from '../sound';
import { PERSONALITY_LABELS, RATING_LABELS, statFrom } from '../engine/ratings';
import { seasonLabel } from '../data/teams';
import { signPlayer, ROSTER_MAX, updateChemistry } from '../engine/league';
import { back, changed, go, useLeague } from '../store';
import { PERSONALITY_KEYS, RATING_KEYS, type SeasonLine } from '../types';
import { OffenseRole } from './OffenseRole';
import { Bar, Card, f1, Headshot, moraleLabel, Ovr, pct, perGameRow, TeamLink } from './common';

const RATING_GROUPS: [string, (typeof RATING_KEYS)[number][]][] = [
  ['Scoring', ['ins', 'tp', 'ft', 'drw', 'usg']],
  ['Playmaking', ['pas', 'hnd', 'oiq']],
  ['Defense & Rebounding', ['def', 'stl', 'blk', 'orb', 'drb']],
  ['Physical', ['sta']],
];

const PERSONALITY_HINTS: Record<string, string> = {
  lead: 'Lifts team chemistry when he is captain.',
  ego: 'High ego players get upset when they play less than they expect, and clash with other big egos.',
  work: 'Drives how much he improves (or how slowly he declines) each offseason.',
  clutch: 'Shoots better in close games in the last minutes.',
  temper: 'Hot-headed players foul more and can pick up technicals or get ejected.',
  team: 'Team-first players handle losing and smaller roles better.',
  loyal: 'Loyal players take bad stretches in stride and rarely ask to be traded.',
};

export function PlayerPage({ id }: { id: string }) {
  const league = useLeague();
  const p = league.players[id];
  if (!p) return <Card title="Player not found"><p>This player has retired.</p><button className="btn" onClick={back}>← Back</button></Card>;
  const user = league.teams[league.userTeam];
  const isFA = league.freeAgents.includes(id);
  const [ml, mc] = moraleLabel(p.morale);
  const team = league.teams[p.stats.team];

  return (
    <div className="player-page">
      <button className="btn ghost back-btn" onClick={back}>← Back</button>
      <div className="player-hero" style={{ background: team ? `linear-gradient(110deg, ${team.colors[0]}, ${team.colors[0]}aa 60%, ${team.colors[1]})` : undefined }}>
        <Headshot p={p} size={120} league={league} />
        <div className="player-hero-main">
          <h2>{p.name}</h2>
          <div className="hero-meta">
            <span>{p.pos}</span><span>Age {p.age}</span>
            <span>{team ? <TeamLink league={league} abbr={team.abbr} full /> : 'Free agent'}</span>
            {p.realTeam && <span className="muted">Real {seasonLabel(league.baseSeason)} team: {p.realTeam}</span>}
            {p.draft && <span className="muted">Drafted {p.draft.season}: R{p.draft.round} #{p.draft.pick} by {p.draft.team}</span>}
          </div>
          {p.injury && <div className="inj-text big">Injured: {p.injury.type}, out {p.injury.games} more games</div>}
          {isFA && (
            <button
              className="btn primary"
              disabled={user.roster.length >= ROSTER_MAX}
              onClick={() => { signPlayer(league, league.userTeam, id); updateChemistry(league, user); play('sign'); changed(); }}
            >{user.roster.length >= ROSTER_MAX ? 'Roster full (15)' : `Sign to ${user.name}`}</button>
          )}
          {p.tradeRequest && <div className="warn-text">📢 Has requested a trade</div>}
          {team && team.abbr !== league.userTeam && (
            <button className="btn" onClick={() => go({ name: 'trade', team: team.abbr, get: id })}>Trade for {p.name.split(' ').slice(-1)[0]}</button>
          )}
          {team && team.abbr === league.userTeam && <button className="btn ghost" onClick={() => go({ name: 'trade' })}>Shop him in a trade</button>}
        </div>
        <div className="hero-ovr">
          <div><Ovr p={p} /><small>OVR</small></div>
          <div><span className="ovr pot">{p.pot}</span><small>POT</small></div>
          <div><span style={{ color: mc, fontWeight: 700 }}>{ml}</span><small>Morale</small></div>
        </div>
      </div>

      <div className="player-grid">
        <Card title="Ratings">
          {RATING_GROUPS.map(([g, keys]) => (
            <div key={g} className="rating-group">
              <h4>{g}</h4>
              {keys.map((k) => <Bar key={k} label={RATING_LABELS[k]} value={p.ratings[k]} hint={ratingHint(k, p.ratings[k])} />)}
            </div>
          ))}
          <div className="tendency muted small">
            Tendencies: {Math.round(p.tend.t3 * 100)}% of shots are threes · Durability {p.dur}
          </div>
        </Card>
        <Card title="Personality">
          {PERSONALITY_KEYS.map((k) => <Bar key={k} label={PERSONALITY_LABELS[k]} value={p.personality[k]} hint={PERSONALITY_HINTS[k]} />)}
          <p className="muted small">Expects about {Math.round(p.expMin)} minutes a night. {personalityBlurb(p.personality)}</p>
        </Card>
        <OffenseRole p={p} editable={team?.abbr === league.userTeam} />
      </div>

      <Card title="Career">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Season</th><th>Team</th><th>G</th><th>GS</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th><th>+/-</th></tr>
            </thead>
            <tbody>
              {p.history.map((h, i) => <CareerRow key={i} s={h} label={h.real ? `${seasonLabel(h.season)} (real life)` : seasonLabel(h.season)} real={h.real} />)}
              {p.stats.g > 0 && <CareerRow s={p.stats} label={`${seasonLabel(league.season)} (current)`} />}
              {p.playoffStats.g > 0 && <CareerRow s={p.playoffStats} label={`${seasonLabel(league.season)} playoffs`} />}
            </tbody>
          </table>
        </div>
      </Card>

      {p.awards.length > 0 && (
        <Card title="Awards">
          <div className="awards">{groupAwards(p.awards).map(([a, n]) => <span key={a} className="award">{a}{n > 1 && ` ×${n}`}</span>)}</div>
        </Card>
      )}
    </div>
  );
}

function CareerRow({ s, label, real }: { s: SeasonLine; label: string; real?: boolean }) {
  const r = perGameRow(s);
  return (
    <tr className={real ? 'real-row' : ''}>
      <td>{label}</td><td>{s.team}</td><td>{s.g}</td><td>{s.gs}</td><td>{f1(r.min)}</td><td><strong>{f1(r.pts)}</strong></td>
      <td>{f1(r.reb)}</td><td>{f1(r.ast)}</td><td>{f1(r.stl)}</td><td>{f1(r.blk)}</td><td>{f1(r.tov)}</td>
      <td>{pct(s.fgm, s.fga)}</td><td>{pct(s.tpm, s.tpa)}</td><td>{pct(s.ftm, s.fta)}</td><td>{real ? '—' : f1(r.pm)}</td>
    </tr>
  );
}

function ratingHint(k: (typeof RATING_KEYS)[number], v: number) {
  const s = statFrom(k, v);
  switch (k) {
    case 'ins': return `≈ ${(s * 100).toFixed(1)}% on twos`;
    case 'tp': return `≈ ${(s * 100).toFixed(1)}% from three`;
    case 'ft': return `≈ ${(s * 100).toFixed(1)}% free throws`;
    case 'drw': return `≈ ${s.toFixed(2)} free throw attempts per shot`;
    case 'pas': return `≈ ${s.toFixed(1)}% assist rate`;
    case 'hnd': return `≈ ${s.toFixed(1)} turnovers per 100 plays`;
    case 'oiq': return `≈ ${s.toFixed(1)} offensive box plus-minus`;
    case 'def': return `≈ ${s.toFixed(1)} defensive box plus-minus`;
    case 'orb': return `≈ ${s.toFixed(1)}% offensive rebound rate`;
    case 'drb': return `≈ ${s.toFixed(1)}% defensive rebound rate`;
    case 'stl': return `≈ ${s.toFixed(1)}% steal rate`;
    case 'blk': return `≈ ${s.toFixed(1)}% block rate`;
    case 'usg': return `≈ ${s.toFixed(1)}% usage rate`;
    case 'sta': return `≈ ${s.toFixed(0)} minutes before fatigue`;
  }
}

// "2016 Player of the Week" earned three times shows once as "×3".
function groupAwards(awards: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const a of awards) counts.set(a, (counts.get(a) ?? 0) + 1);
  return [...counts];
}

function personalityBlurb(p: Record<string, number>) {
  const t: string[] = [];
  if (p.lead >= 80) t.push('A natural leader.');
  if (p.ego >= 80) t.push('Wants to be the star.');
  if (p.work >= 85) t.push('Gym rat — expect him to improve.');
  if (p.work <= 30) t.push('Coasts on talent.');
  if (p.clutch >= 85) t.push('Ice in his veins.');
  if (p.temper >= 80) t.push('Plays with a short fuse.');
  if (p.team >= 80) t.push('Ultimate team player.');
  return t.join(' ');
}

