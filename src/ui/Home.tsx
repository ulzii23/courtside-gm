import { useEffect, useState } from 'react';
import { deleteLeague, listLeagues, saveLeague, type LeagueSummary } from '../db';
import { seasonLabel, teamsForSeason } from '../data/teams';
import { createLeague } from '../engine/league';
import { openLeague, setLeague } from '../store';
import type { RawPlayer } from '../types';
import { TeamLogo } from './common';

export function Home() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number>(2016);
  const [team, setTeam] = useState<string>('');
  const [saved, setSaved] = useState<LeagueSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/index.json`)
      .then((r) => r.json())
      .then((d: { seasons: number[] }) => {
        setSeasons(d.seasons);
        setSeason(d.seasons[d.seasons.length - 1]);
      })
      .catch(() => setError('Could not load season list. Run `npm run fetch-data` first.'));
    listLeagues().then(setSaved);
  }, []);

  const teams = teamsForSeason(season).sort((a, b) => a.name.localeCompare(b.name));

  async function start() {
    if (!team) return;
    setLoading(true);
    try {
      const data: { players: RawPlayer[] } = await fetch(`${import.meta.env.BASE_URL}data/${season}.json`).then((r) => r.json());
      const league = createLeague(season, data.players, team, (Math.random() * 2 ** 32) >>> 0);
      await saveLeague(league);
      setLeague(league, { name: 'draft' });
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  }

  return (
    <div className="home">
      <div className="hero">
        <h1>Courtside <span>GM</span></h1>
        <p>Pick any season from {seasons.length ? seasonLabel(seasons[0]) : '2007-08'} to {seasons.length ? seasonLabel(seasons[seasons.length - 1]) : 'today'}, run a fantasy draft with that year's real players, then manage your team through a full season, playoffs, and beyond.</p>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="home-grid">
        <section className="card">
          <header className="card-head"><h3>New league</h3></header>
          <label className="field">
            <span>Season (players and ratings come from this year)</span>
            <select value={season} onChange={(e) => { setSeason(Number(e.target.value)); setTeam(''); }}>
              {[...seasons].reverse().map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}
            </select>
          </label>
          <div className="field"><span>Choose your team</span></div>
          <div className="team-pick">
            {teams.map((t) => (
              <button
                key={t.abbr}
                className={`team-tile ${team === t.abbr ? 'selected' : ''}`}
                style={{ borderColor: team === t.abbr ? t.colors[1] : undefined, background: team === t.abbr ? t.colors[0] : undefined }}
                onClick={() => setTeam(t.abbr)}
              >
                <TeamLogo abbr={t.abbr} season={season} name={t.name} size={26} fallback={<span className="swatch" style={{ background: `linear-gradient(135deg, ${t.colors[0]} 50%, ${t.colors[1]} 50%)` }} />} />
                {t.name}
              </button>
            ))}
          </div>
          <button className="btn primary big" disabled={!team || loading} onClick={start}>
            {loading ? 'Building league…' : team ? `Start fantasy draft as ${teams.find((t) => t.abbr === team)?.name}` : 'Pick a team to start'}
          </button>
          <p className="muted small">Every roster is wiped and all players from that season go into one draft pool. You draft against 29 AI general managers, 13 rounds, snake order.</p>
        </section>

        <section className="card">
          <header className="card-head"><h3>Saved leagues</h3></header>
          {!saved.length && <p className="muted">No saved leagues yet.</p>}
          {saved.map((s) => (
            <div key={s.id} className="saved-row">
              <div>
                <strong>{s.userTeam}</strong> · {seasonLabel(s.season)} <span className="muted">(started {seasonLabel(s.baseSeason)})</span>
                <div className="muted small">{s.phase} · {s.record}</div>
              </div>
              <div className="row-actions">
                <button className="btn" onClick={() => openLeague(s.id)}>Continue</button>
                <button
                  className="btn ghost danger"
                  onClick={async () => {
                    if (!confirm('Delete this league? This cannot be undone.')) return;
                    await deleteLeague(s.id);
                    setSaved(await listLeagues());
                  }}
                >Delete</button>
              </div>
            </div>
          ))}
        </section>
      </div>
      <p className="muted small disclaimer">
        Fan-made game. Not affiliated with, endorsed by, or sponsored by the NBA, its teams, or the NBPA.
        Player names and statistics are used for informational and entertainment purposes. Stats: Basketball-Reference.
      </p>
    </div>
  );
}
