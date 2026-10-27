import { useSyncExternalStore } from 'react';
import type { GameResult, League } from './types';
import { loadLeague, saveGames, saveLeague } from './db';
import { simDay, userNextGame } from './engine/league';
import { migrateLeague } from './engine/transactions';
import { play } from './sound';

// A tiny global store. The league object is mutated in place by the engine,
// so every change bumps `rev` to re-render subscribers.

export type View =
  | { name: 'home' }
  | { name: 'draft' }
  | { name: 'dashboard' }
  | { name: 'roster'; team?: string }
  | { name: 'player'; id: string }
  | { name: 'schedule'; team?: string }
  | { name: 'game'; id: number; season: number }
  | { name: 'standings' }
  | { name: 'stats' }
  | { name: 'leaders' }
  | { name: 'playoffs' }
  | { name: 'freeagents' }
  | { name: 'trade'; team?: string; get?: string }
  | { name: 'history' }
  | { name: 'news' };

interface State {
  league: League | null;
  view: View;
  rev: number;
  simming: boolean;
  simLabel: string;
}

let state: State = { league: null, view: { name: 'home' }, rev: 0, simming: false, simLabel: '' };
const listeners = new Set<() => void>();
let stopRequested = false;

function emit() {
  state = { ...state, rev: state.rev + 1 };
  for (const l of listeners) l();
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => select(state),
  );
}
// Re-render on every league change.
export const useLeague = () => {
  useStore((s) => s.rev);
  return state.league!;
};

// Every view change is a browser history entry, so the back button (and
// back()) return to the previous page. `depth` counts in-app entries.
let depth = 0;

export function go(view: View) {
  state = { ...state, view };
  depth++;
  history.pushState({ view, depth }, '');
  emit();
  window.scrollTo(0, 0);
}

export function setLeague(league: League | null, view: View) {
  state = { ...state, league, view };
  depth = 0;
  history.replaceState({ view, depth }, '');
  emit();
}

export function back() {
  if (depth > 0) history.back();
  else go({ name: 'dashboard' });
}

window.addEventListener('popstate', (e) => {
  const s = e.state as { view: View; depth: number } | null;
  if (!s || !state.league) return;
  depth = s.depth;
  state = { ...state, view: s.view };
  emit();
});

export async function openLeague(id: string) {
  const l = await loadLeague(id);
  if (!l) return;
  migrateLeague(l);
  setLeague(l, { name: l.phase === 'draft' || l.phase === 'rookie-draft' ? 'draft' : 'dashboard' });
}

let saveTimer: number | undefined;
// Call after any change to the league: re-renders now, saves shortly after.
export function changed() {
  emit();
  const l = state.league;
  if (!l) return;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveLeague(l), 400);
}

export function stopSim() {
  stopRequested = true;
}

export type SimUntil = 'next-game' | 'week' | 'month' | 'regular-end' | 'day' | 'round' | 'season-end';

export async function sim(until: SimUntil) {
  const l = state.league;
  if (!l || state.simming) return;
  stopRequested = false;
  state = { ...state, simming: true, simLabel: 'Simulating…' };
  emit();
  const startPhase = l.phase;
  const openRounds = l.series.filter((s) => !s.winner).map((s) => s.round);
  const startRound = openRounds.length ? Math.min(...openRounds) : 0;
  const nextGame = until === 'next-game' ? userNextGame(l) : undefined;
  // In the playoffs there is no fixed schedule, so "next game" means the next day.
  const target = until === 'week' ? 7 : until === 'month' ? 30 : until === 'day' || (until === 'next-game' && !nextGame) ? 1 : Infinity;
  let days = 0;
  let pending: GameResult[] = [];
  const season = l.season;
  const hadChampion = !!l.champion;
  let lastUserGame: { win: boolean } | null = null;

  while (!stopRequested && (l.phase === 'regular' || l.phase === 'playoffs')) {
    if (until === 'regular-end' && l.phase !== 'regular') break;
    if (startPhase === 'regular' && l.phase === 'playoffs' && until !== 'season-end') break;
    if (until === 'round' && l.phase === 'playoffs') {
      const open = l.series.filter((s) => !s.winner);
      if (!open.length || Math.min(...open.map((s) => s.round)) > startRound) break;
    }
    if (nextGame && nextGame.played) break;
    if (days >= target) break;
    const dayResults = simDay(l);
    pending.push(...dayResults);
    for (const r of dayResults) {
      if (r.home.abbr === l.userTeam) lastUserGame = { win: r.home.score > r.away.score };
      else if (r.away.abbr === l.userTeam) lastUserGame = { win: r.away.score > r.home.score };
    }
    days++;
    if (days % 3 === 0 || pending.length > 60) {
      await saveGames(l.id, season, pending);
      pending = [];
      state = { ...state, simLabel: `Simulating… ${l.phase === 'regular' ? `day ${l.day}` : 'playoffs'}` };
      emit();
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (pending.length) await saveGames(l.id, season, pending);
  // Sound for how it went: title, else the last result of the user's team, else the end of the regular season.
  if (l.champion && !hadChampion) play(l.champion === l.userTeam ? 'champion' : 'buzzer');
  else if (lastUserGame) play(lastUserGame.win ? 'win' : 'loss');
  else if (l.phase !== startPhase) play('buzzer');
  await saveLeague(l);
  state = { ...state, simming: false, simLabel: '' };
  emit();
}

export function getState() {
  return state;
}
