// Raw per-season stats as produced by scripts/fetch-data.mjs (per-game averages + advanced).
export interface RawPlayer {
  id: string;
  name: string;
  age: number;
  pos: string;
  team: string | null;
  g: number; gs: number; mp: number;
  fg: number; fga: number; fg3: number; fg3a: number; fg2: number; fg2a: number;
  ft: number; fta: number; orb: number; drb: number; trb: number;
  ast: number; stl: number; blk: number; tov: number; pf: number; pts: number;
  per: number; ts: number; orbP: number; drbP: number; astP: number;
  stlP: number; blkP: number; tovP: number; usg: number; ws: number; ws48: number;
  obpm: number; dbpm: number; bpm: number; awards: string;
}

export const RATING_KEYS = [
  'ins', 'tp', 'ft', 'drw', 'pas', 'hnd', 'oiq', 'orb', 'drb', 'stl', 'blk', 'def', 'usg', 'sta',
] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export type Ratings = Record<RatingKey, number>;

export const PERSONALITY_KEYS = ['lead', 'ego', 'work', 'clutch', 'temper', 'team', 'loyal'] as const;
export type PersonalityKey = (typeof PERSONALITY_KEYS)[number];
export type Personality = Record<PersonalityKey, number>;

export interface Tendencies {
  t3: number; // share of FGA that are threes
  ftr: number; // FTA per FGA
}

// How a player plays on offense. Each key is a level from -2 (avoid) to +2 (all the time);
// missing or 0 means his natural game. Several can be set at once and they blend.
export const FOCUS_KEYS = ['three', 'mid', 'post', 'rim', 'shoot', 'pass', 'crash'] as const;
export type FocusKey = (typeof FOCUS_KEYS)[number];
export type Focus = Partial<Record<FocusKey, number>>;

export interface SeasonLine {
  season: number;
  team: string;
  real?: boolean; // the player's real-life season, kept for comparison
  g: number; gs: number; min: number; pts: number; orb: number; drb: number;
  ast: number; stl: number; blk: number; tov: number; pf: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; pm: number;
}

export interface Player {
  id: string;
  name: string;
  img: string | null; // headshot id (Basketball-Reference); null for generated players
  pos: string;
  age: number;
  ratings: Ratings;
  pot: number;
  personality: Personality;
  tend: Tendencies;
  focus?: Focus; // offensive role set by the GM
  realTeam: string | null; // team in real life that season
  expMin: number; // minutes the player expects (real role)
  morale: number; // 0-100
  injury: { type: string; games: number } | null;
  dur: number; // durability 0-100
  stats: SeasonLine; // current season, regular season
  playoffStats: SeasonLine;
  history: SeasonLine[];
  awards: string[];
  draft?: { season: number; round: number; pick: number; team: string };
  rookie?: boolean;
  tradeRequest?: boolean;
}

export type OffenseSystem =
  | 'balanced' | 'pace-space' | 'inside-out' | 'heliocentric' | 'motion' | 'run-gun' | 'pick-roll' | 'post-up' | 'iso';
export type DefenseSystem = 'man' | 'switch' | 'drop' | 'zone' | 'press';
export type Pace = 'slow' | 'normal' | 'fast';

export interface Strategy {
  // A team can mix up to three systems; each possession uses one of them at random.
  offense: OffenseSystem[];
  defense: DefenseSystem[];
  pace: Pace;
  captain: string | null;
  closer: string | null; // go-to player in clutch time
}

export interface Team {
  abbr: string;
  name: string;
  conf: 'East' | 'West';
  div: string;
  colors: [string, string];
  roster: string[]; // player ids, in rotation order (first 5 = starters)
  minutes: Record<string, number>; // target minutes, sums to 240
  strategy: Strategy;
  autoLineup: boolean; // AI manages the rotation
  w: number; l: number;
  homeW: number; homeL: number;
  pf: number; pa: number;
  streak: number; // +n wins / -n losses
  chem: number; // team chemistry 0-100
}

export interface BoxLine {
  id: string;
  name: string;
  pos: string;
  starter: boolean;
  min: number; pts: number; orb: number; drb: number; ast: number; stl: number; blk: number;
  tov: number; pf: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; pm: number;
  dnp?: string;
}

export interface BoxTeam {
  abbr: string;
  score: number;
  quarters: number[];
  lines: BoxLine[];
}

export interface GameResult {
  id: number;
  day: number;
  home: BoxTeam;
  away: BoxTeam;
  ot: number;
  playoff?: string; // round label
  notes: string[];
}

export interface ScheduledGame {
  id: number;
  day: number;
  home: string;
  away: string;
  played: boolean;
  homeScore?: number;
  awayScore?: number;
}

export interface Series {
  id: string;
  round: number; // 0 = play-in, 1..4
  label: string;
  conf: 'East' | 'West' | 'Finals';
  high: string; // higher seed (home court)
  low: string;
  highSeed: number;
  lowSeed: number;
  winsHigh: number;
  winsLow: number;
  bestOf: number;
  games: number[]; // game result ids
  slot: number; // bracket position within the round
  winner: string | null;
}

export type Phase = 'draft' | 'preseason' | 'regular' | 'playoffs' | 'offseason' | 'rookie-draft';

export interface DraftState {
  order: string[]; // team abbr for every pick
  pick: number;
  picks: { pick: number; team: string; player: string }[];
  pool: string[]; // available player ids
  rookie: boolean;
  started?: boolean; // fantasy draft waits for setup (slot, timer) before the first pick
  timer?: number; // seconds per user pick, 0 = no timer
  queue?: string[]; // players the user wants, used first by auto-pick
}

export interface AwardEntry {
  season: number;
  mvp?: string; dpoy?: string; fmvp?: string; champion?: string; runnerUp?: string;
  allLeague?: string[];
  userTeam: string; userRecord: string; userResult: string;
}

export interface PeriodLine {
  g: number; w: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; ftm: number; fta: number; tpm: number;
}

export interface NewsItem {
  day: number;
  season: number;
  text: string;
  kind?: 'social' | 'award'; // plain news when missing
  by?: string; // social handle
  pid?: string; // player the item is about
  team?: string;
}

export interface Honor {
  season: number;
  day: number;
  kind: 'POW' | 'POM' | 'ROM'; // player of the week / month, rookie of the month
  label: string; // "Week 3", "December"
  conf: 'East' | 'West';
  pid: string;
  team: string;
  line: string;
}

export interface League {
  version: number;
  id: string;
  createdAt: number;
  baseSeason: number; // real season the league started from
  season: number; // current season end year (fictional after the first)
  phase: Phase;
  userTeam: string;
  day: number;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  freeAgents: string[];
  schedule: ScheduledGame[];
  draft: DraftState | null;
  series: Series[];
  playoffDay: number;
  champion: string | null;
  history: AwardEntry[];
  news: NewsItem[];
  honors?: Honor[];
  // Stat totals since the last weekly / monthly award (regular season only).
  period?: { week: Record<string, PeriodLine>; month: Record<string, PeriodLine> };
  rngSeed: number;
  nextGameId: number;
  pace: number; // league possessions per 48
  defMean: number; // league mean defense rating (centering)
  trades: { day: number; season: number; teams: [string, string]; sent: [string[], string[]] }[];
}
