import type { GameResult, League } from './types';

// IndexedDB storage: one record per league, plus every box score keyed by league + game id.
const DB_NAME = 'courtside-gm';
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('leagues');
      db.createObjectStore('games');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = () => reject(t.error);
  }));
}

export interface LeagueSummary {
  id: string;
  season: number;
  baseSeason: number;
  userTeam: string;
  record: string;
  phase: string;
  updated: number;
}

export const saveLeague = (league: League) => tx('leagues', 'readwrite', (s) => s.put(league, league.id));
export const loadLeague = (id: string) => tx<League | undefined>('leagues', 'readonly', (s) => s.get(id));

export async function listLeagues(): Promise<LeagueSummary[]> {
  const all = await tx<League[]>('leagues', 'readonly', (s) => s.getAll());
  return all.map((l) => {
    const t = l.teams[l.userTeam];
    return {
      id: l.id, season: l.season, baseSeason: l.baseSeason, userTeam: l.userTeam,
      record: `${t.w}-${t.l}`, phase: l.phase, updated: l.createdAt,
    };
  });
}

export async function deleteLeague(id: string) {
  await tx('leagues', 'readwrite', (s) => s.delete(id));
  await tx('games', 'readwrite', (s) => s.delete(IDBKeyRange.bound(`${id}:`, `${id}:￿`)));
}

export const saveGames = (leagueId: string, season: number, games: GameResult[]) =>
  tx('games', 'readwrite', (s) => {
    for (const g of games) s.put(g, `${leagueId}:${season}:${String(g.id).padStart(6, '0')}`);
  });

export const loadGame = (leagueId: string, season: number, id: number) =>
  tx<GameResult | undefined>('games', 'readonly', (s) => s.get(`${leagueId}:${season}:${String(id).padStart(6, '0')}`));
