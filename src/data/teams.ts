// Franchise names by season (season = end year, e.g. 2008 = 2007-08).
// Abbreviations follow Basketball-Reference, which is where the player data comes from.

interface Franchise {
  conf: 'East' | 'West';
  div: string;
  colors: [string, string];
  eras: { from: number; abbr: string; name: string; colors?: [string, string] }[];
}

const FRANCHISES: Franchise[] = [
  { conf: 'East', div: 'Atlantic', colors: ['#007A33', '#BA9653'], eras: [{ from: 0, abbr: 'BOS', name: 'Boston Celtics' }] },
  { conf: 'East', div: 'Atlantic', colors: ['#000000', '#FFFFFF'], eras: [
    { from: 0, abbr: 'NJN', name: 'New Jersey Nets', colors: ['#002A60', '#CD1041'] },
    { from: 2013, abbr: 'BRK', name: 'Brooklyn Nets' },
  ] },
  { conf: 'East', div: 'Atlantic', colors: ['#006BB6', '#F58426'], eras: [{ from: 0, abbr: 'NYK', name: 'New York Knicks' }] },
  { conf: 'East', div: 'Atlantic', colors: ['#006BB6', '#ED174C'], eras: [{ from: 0, abbr: 'PHI', name: 'Philadelphia 76ers' }] },
  { conf: 'East', div: 'Atlantic', colors: ['#CE1141', '#000000'], eras: [{ from: 0, abbr: 'TOR', name: 'Toronto Raptors' }] },
  { conf: 'East', div: 'Central', colors: ['#CE1141', '#000000'], eras: [{ from: 0, abbr: 'CHI', name: 'Chicago Bulls' }] },
  { conf: 'East', div: 'Central', colors: ['#860038', '#FDBB30'], eras: [{ from: 0, abbr: 'CLE', name: 'Cleveland Cavaliers' }] },
  { conf: 'East', div: 'Central', colors: ['#C8102E', '#1D42BA'], eras: [{ from: 0, abbr: 'DET', name: 'Detroit Pistons' }] },
  { conf: 'East', div: 'Central', colors: ['#002D62', '#FDBB30'], eras: [{ from: 0, abbr: 'IND', name: 'Indiana Pacers' }] },
  { conf: 'East', div: 'Central', colors: ['#00471B', '#EEE1C6'], eras: [{ from: 0, abbr: 'MIL', name: 'Milwaukee Bucks' }] },
  { conf: 'East', div: 'Southeast', colors: ['#E03A3E', '#C1D32F'], eras: [{ from: 0, abbr: 'ATL', name: 'Atlanta Hawks' }] },
  { conf: 'East', div: 'Southeast', colors: ['#1D1160', '#00788C'], eras: [
    { from: 0, abbr: 'CHA', name: 'Charlotte Bobcats', colors: ['#F26532', '#2C5234'] },
    { from: 2015, abbr: 'CHO', name: 'Charlotte Hornets' },
  ] },
  { conf: 'East', div: 'Southeast', colors: ['#98002E', '#F9A01B'], eras: [{ from: 0, abbr: 'MIA', name: 'Miami Heat' }] },
  { conf: 'East', div: 'Southeast', colors: ['#0077C0', '#C4CED4'], eras: [{ from: 0, abbr: 'ORL', name: 'Orlando Magic' }] },
  { conf: 'East', div: 'Southeast', colors: ['#002B5C', '#E31837'], eras: [{ from: 0, abbr: 'WAS', name: 'Washington Wizards' }] },
  { conf: 'West', div: 'Northwest', colors: ['#0E2240', '#FEC524'], eras: [{ from: 0, abbr: 'DEN', name: 'Denver Nuggets' }] },
  { conf: 'West', div: 'Northwest', colors: ['#0C2340', '#236192'], eras: [{ from: 0, abbr: 'MIN', name: 'Minnesota Timberwolves' }] },
  { conf: 'West', div: 'Northwest', colors: ['#007AC1', '#EF3B24'], eras: [
    { from: 0, abbr: 'SEA', name: 'Seattle SuperSonics', colors: ['#00653A', '#FFC200'] },
    { from: 2009, abbr: 'OKC', name: 'Oklahoma City Thunder' },
  ] },
  { conf: 'West', div: 'Northwest', colors: ['#E03A3E', '#000000'], eras: [{ from: 0, abbr: 'POR', name: 'Portland Trail Blazers' }] },
  { conf: 'West', div: 'Northwest', colors: ['#002B5C', '#F9A01B'], eras: [{ from: 0, abbr: 'UTA', name: 'Utah Jazz' }] },
  { conf: 'West', div: 'Pacific', colors: ['#1D428A', '#FFC72C'], eras: [{ from: 0, abbr: 'GSW', name: 'Golden State Warriors' }] },
  { conf: 'West', div: 'Pacific', colors: ['#C8102E', '#1D428A'], eras: [{ from: 0, abbr: 'LAC', name: 'Los Angeles Clippers' }] },
  { conf: 'West', div: 'Pacific', colors: ['#552583', '#FDB927'], eras: [{ from: 0, abbr: 'LAL', name: 'Los Angeles Lakers' }] },
  { conf: 'West', div: 'Pacific', colors: ['#1D1160', '#E56020'], eras: [{ from: 0, abbr: 'PHO', name: 'Phoenix Suns' }] },
  { conf: 'West', div: 'Pacific', colors: ['#5A2D81', '#63727A'], eras: [{ from: 0, abbr: 'SAC', name: 'Sacramento Kings' }] },
  { conf: 'West', div: 'Southwest', colors: ['#00538C', '#B8C4CA'], eras: [{ from: 0, abbr: 'DAL', name: 'Dallas Mavericks' }] },
  { conf: 'West', div: 'Southwest', colors: ['#CE1141', '#000000'], eras: [{ from: 0, abbr: 'HOU', name: 'Houston Rockets' }] },
  { conf: 'West', div: 'Southwest', colors: ['#5D76A9', '#12173F'], eras: [{ from: 0, abbr: 'MEM', name: 'Memphis Grizzlies' }] },
  { conf: 'West', div: 'Southwest', colors: ['#0C2340', '#C8102E'], eras: [
    { from: 0, abbr: 'NOH', name: 'New Orleans Hornets', colors: ['#00778B', '#5F259F'] },
    { from: 2014, abbr: 'NOP', name: 'New Orleans Pelicans' },
  ] },
  { conf: 'West', div: 'Southwest', colors: ['#C4CED4', '#000000'], eras: [{ from: 0, abbr: 'SAS', name: 'San Antonio Spurs' }] },
];

export interface TeamInfo {
  abbr: string;
  name: string;
  conf: 'East' | 'West';
  div: string;
  colors: [string, string];
}

export function teamsForSeason(season: number): TeamInfo[] {
  return FRANCHISES.map((f) => {
    const era = [...f.eras].reverse().find((e) => season >= e.from)!;
    return { abbr: era.abbr, name: era.name, conf: f.conf, div: f.div, colors: era.colors ?? f.colors };
  });
}

// Maps any historical abbreviation to the one used in the given season (e.g. SEA -> OKC in 2010).
export function currentAbbr(abbr: string, season: number): string {
  const f = FRANCHISES.find((fr) => fr.eras.some((e) => e.abbr === abbr));
  if (!f) return abbr;
  return [...f.eras].reverse().find((e) => season >= e.from)!.abbr;
}

export function seasonLabel(season: number): string {
  return `${season - 1}-${String(season).slice(2)}`;
}

// League pace (possessions per 48) by season, rounded from league averages.
const PACE: Record<number, number> = {
  2008: 92.4, 2009: 91.7, 2010: 92.7, 2011: 92.1, 2012: 91.3, 2013: 92.0, 2014: 93.9, 2015: 93.9,
  2016: 95.8, 2017: 96.4, 2018: 97.3, 2019: 100.0, 2020: 100.3, 2021: 99.2, 2022: 98.2, 2023: 99.2,
  2024: 98.5, 2025: 98.8, 2026: 99.5,
};
export const paceFor = (season: number) => PACE[season] ?? 99.5;

export function headshotUrl(img: string): string {
  return `https://www.basketball-reference.com/req/202106291/images/headshots/${img}.jpg`;
}

