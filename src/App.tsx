import { seasonLabel } from './data/teams';
import { go, setLeague, sim, stopSim, useStore, type SimUntil, type View } from './store';
import { Dashboard, FreeAgents, History, News } from './ui/Dashboard';
import { Draft } from './ui/Draft';
import { BoxScore, Schedule } from './ui/Games';
import { Home } from './ui/Home';
import { Leaders, Playoffs, Standings, Stats } from './ui/LeagueViews';
import { PlayerPage } from './ui/PlayerPage';
import { Roster } from './ui/Roster';
import { Trade } from './ui/Trade';
import { TeamBadge } from './ui/common';
import { useState, useSyncExternalStore } from 'react';
import { onSoundChange, setSound, soundOn } from './sound';

const NAV: [View['name'], string][] = [
  ['dashboard', 'Dashboard'], ['roster', 'Lineup & Strategy'], ['schedule', 'Schedule'], ['standings', 'Standings'],
  ['playoffs', 'Playoffs'], ['stats', 'Player Stats'], ['leaders', 'League Leaders'], ['trade', 'Trades'], ['freeagents', 'Free Agents'],
  ['history', 'History & Awards'], ['news', 'News'],
];

export default function App() {
  const view = useStore((s) => s.view);
  const league = useStore((s) => s.league);
  useStore((s) => s.rev);
  const simming = useStore((s) => s.simming);
  const simLabel = useStore((s) => s.simLabel);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!league || view.name === 'home') return <div className="app-home"><div className="home-sound"><SoundToggle /></div><Home /></div>;

  const user = league.teams[league.userTeam];
  const inDraft = league.phase === 'draft' || league.phase === 'rookie-draft';

  // [action, label, short label for phones]
  const simButtons: [SimUntil, string, string][] =
    league.phase === 'regular'
      ? [['next-game', 'Play next game', 'Next game'], ['week', 'Sim week', 'Week'], ['month', 'Sim month', 'Month'], ['regular-end', 'Sim to playoffs', 'To playoffs']]
      : league.phase === 'playoffs'
        ? [['day', 'Sim day', 'Day'], ['round', 'Sim round', 'Round'], ['season-end', 'Sim to end', 'To end']]
        : [];
  const nav = (v: View) => { setMenuOpen(false); go(v); };

  return (
    <div className="app">
      {menuOpen && <div className="backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand" onClick={() => setLeague(null, { name: 'home' })} title="Back to main menu">Courtside <span>GM</span></div>
        <div className="side-team" style={{ borderColor: user.colors[0] }}>
          <TeamBadge league={league} abbr={user.abbr} size={30} />
          <div>
            <div className="side-team-name">{user.name}</div>
            <div className="muted small">{seasonLabel(league.season)} · {user.w}-{user.l}</div>
          </div>
        </div>
        <nav>
          {inDraft && <a className={view.name === 'draft' ? 'active' : ''} onClick={() => nav({ name: 'draft' })}>Draft Room</a>}
          {NAV.map(([name, label]) => (
            <a key={name} className={view.name === name ? 'active' : ''} onClick={() => nav({ name } as View)}>{label}</a>
          ))}
        </nav>
        <div className="side-foot muted small">Fan-made · not affiliated with the NBA</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="menu-btn" aria-label="Menu" onClick={() => setMenuOpen(true)}>☰</button>
          <div className="phase">
            <strong>{seasonLabel(league.season)}</strong>
            <span className="muted"> · {phaseLabel(league.phase)}{league.phase === 'regular' ? ` · Day ${league.day + 1}` : ''}</span>
          </div>
          <div className="sim-controls">
            {simming ? (
              <>
                <span className="muted">{simLabel}</span>
                <button className="btn ghost" onClick={stopSim}>Stop</button>
              </>
            ) : (
              simButtons.map(([u, label, short], i) => (
                <button key={u} className={`btn ${i === 0 ? 'primary' : ''}`} onClick={() => void sim(u)}>
                  <span className="long">{label}</span><span className="short">{short}</span>
                </button>
              ))
            )}
            {inDraft && view.name !== 'draft' && <button className="btn primary" onClick={() => go({ name: 'draft' })}>Go to draft</button>}
            <SoundToggle />
          </div>
        </div>
        <div className="content">
          <Page view={view} />
        </div>
      </main>
    </div>
  );
}

function phaseLabel(p: string) {
  return ({ draft: 'Fantasy Draft', 'rookie-draft': 'Rookie Draft', regular: 'Regular Season', playoffs: 'Playoffs', offseason: 'Offseason', preseason: 'Preseason' } as Record<string, string>)[p] ?? p;
}

function Page({ view }: { view: View }) {
  switch (view.name) {
    case 'draft': return <Draft />;
    case 'dashboard': return <Dashboard />;
    case 'roster': return <Roster teamAbbr={view.team} key={view.team ?? 'mine'} />;
    case 'player': return <PlayerPage id={view.id} />;
    case 'schedule': return <Schedule teamAbbr={view.team} />;
    case 'game': return <BoxScore id={view.id} season={view.season} />;
    case 'standings': return <Standings />;
    case 'stats': return <Stats />;
    case 'leaders': return <Leaders />;
    case 'playoffs': return <Playoffs />;
    case 'freeagents': return <FreeAgents />;
    case 'trade': return <Trade initialTeam={view.team} initialGet={view.get} key={`${view.team}-${view.get}`} />;
    case 'history': return <History />;
    case 'news': return <News />;
    default: return null;
  }
}

function SoundToggle() {
  const on = useSyncExternalStore(onSoundChange, soundOn);
  return (
    <button className="icon-btn sound-btn" title={on ? 'Mute sounds' : 'Turn sounds on'} aria-label={on ? 'Mute sounds' : 'Turn sounds on'} onClick={() => setSound(!on)}>
      {on ? '🔊' : '🔇'}
    </button>
  );
}
