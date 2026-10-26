// Builds public/data/<year>.json from Basketball-Reference season pages.
// Usage: node scripts/fetch-data.mjs [firstYear] [lastYear]
// Years are season END years (2008 = the 2007-08 season).
// Pages are cached in scripts/.cache and requested at most once every 4s,
// which keeps well under Basketball-Reference's rate limit.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, 'scripts', '.cache');
const outDir = join(root, 'public', 'data');

const first = Number(process.argv[2] ?? 2008);
const last = Number(process.argv[3] ?? 2026);
const DELAY_MS = 4000;

let lastRequest = 0;
async function getPage(url, cacheName) {
  const cachePath = join(cacheDir, cacheName);
  if (existsSync(cachePath)) return readFile(cachePath, 'utf8');
  const wait = lastRequest + DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': 'CourtsideGM-data-builder (personal fan project)' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const html = await res.text();
  await writeFile(cachePath, html);
  return html;
}

const stripTags = (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

// Returns rows as { id, cells: {stat: text} } for the table with the given id.
function parseTable(html, tableId) {
  const start = html.indexOf(`id="${tableId}"`);
  if (start < 0) throw new Error(`table ${tableId} not found`);
  const end = html.indexOf('</table>', start);
  const body = html.slice(start, end);
  const rows = [];
  for (const rowHtml of body.split(/<tr[\s>]/).slice(1)) {
    const idMatch = rowHtml.match(/data-append-csv="([^"]+)"/);
    if (!idMatch) continue; // header rows and "League Average"
    const cells = {};
    for (const m of rowHtml.matchAll(/data-stat="([a-z0-9_]+)"[^>]*>(.*?)<\/t[dh]>/g)) {
      cells[m[1]] = stripTags(m[2]);
    }
    rows.push({ id: idMatch[1], cells });
  }
  return rows;
}

const num = (v) => (v === undefined || v === '' ? 0 : Number(v));

// Traded players appear as a combined row ("2TM", "3TM"...) followed by one row
// per team. Keep the combined stats and the team they finished the season with.
function collapse(rows) {
  const byId = new Map();
  for (const r of rows) {
    const team = r.cells.team_name_abbr;
    const existing = byId.get(r.id);
    if (!existing) byId.set(r.id, { ...r, finalTeam: /^\dTM$|^TOT$/.test(team) ? null : team });
    else if (!/^\dTM$|^TOT$/.test(team)) existing.finalTeam = team;
  }
  return byId;
}

const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

async function buildSeason(year) {
  const perGame = collapse(parseTable(
    await getPage(`https://www.basketball-reference.com/leagues/NBA_${year}_per_game.html`, `${year}_per_game.html`),
    'per_game_stats',
  ));
  const advanced = collapse(parseTable(
    await getPage(`https://www.basketball-reference.com/leagues/NBA_${year}_advanced.html`, `${year}_advanced.html`),
    'advanced',
  ));

  const players = [];
  for (const [id, row] of perGame) {
    const c = row.cells;
    const a = advanced.get(id)?.cells ?? {};
    players.push({
      id,
      name: c.name_display,
      age: num(c.age),
      pos: (c.pos || 'F').split('-')[0],
      team: row.finalTeam,
      g: num(c.games), gs: num(c.games_started), mp: num(c.mp_per_g),
      fg: num(c.fg_per_g), fga: num(c.fga_per_g),
      fg3: num(c.fg3_per_g), fg3a: num(c.fg3a_per_g),
      fg2: num(c.fg2_per_g), fg2a: num(c.fg2a_per_g),
      ft: num(c.ft_per_g), fta: num(c.fta_per_g),
      orb: num(c.orb_per_g), drb: num(c.drb_per_g), trb: num(c.trb_per_g),
      ast: num(c.ast_per_g), stl: num(c.stl_per_g), blk: num(c.blk_per_g),
      tov: num(c.tov_per_g), pf: num(c.pf_per_g), pts: num(c.pts_per_g),
      per: r1(num(a.per)), ts: r3(num(a.ts_pct)),
      orbP: r1(num(a.orb_pct)), drbP: r1(num(a.drb_pct)), astP: r1(num(a.ast_pct)),
      stlP: r1(num(a.stl_pct)), blkP: r1(num(a.blk_pct)), tovP: r1(num(a.tov_pct)),
      usg: r1(num(a.usg_pct)), ws: r1(num(a.ws)), ws48: r3(num(a.ws_per_48)),
      obpm: r1(num(a.obpm)), dbpm: r1(num(a.dbpm)), bpm: r1(num(a.bpm)),
      awards: c.awards || '',
    });
  }
  await writeFile(join(outDir, `${year}.json`), JSON.stringify({ season: year, players }));
  console.log(`${year}: ${players.length} players`);
}

await mkdir(cacheDir, { recursive: true });
await mkdir(outDir, { recursive: true });
for (let y = first; y <= last; y++) await buildSeason(y);
const seasons = [];
for (let y = 2008; y <= 2030; y++) if (existsSync(join(outDir, `${y}.json`))) seasons.push(y);
await writeFile(join(outDir, 'index.json'), JSON.stringify({ seasons }));
console.log('done:', seasons.join(', '));
