import { useState, type ReactNode } from 'react';
import type { League, Player, SeasonLine } from '../types';
import { headshotUrl } from '../data/teams';
import { ovr } from '../engine/ratings';
import { go } from '../store';

export function Headshot({ p, size = 40, league }: { p: Player; size?: number; league?: League }) {
  const [failed, setFailed] = useState(false);
  const team = league?.teams[p.stats.team];
  const bg = team?.colors[0] ?? '#334';
  const initials = p.name.split(' ').map((s) => s[0]).slice(0, 2).join('');
  if (!p.img || failed) {
    return (
      <div className="headshot initials" style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}>
        {initials}
      </div>
    );
  }
  return (
    <img
      className="headshot"
      src={headshotUrl(p.img)}
      alt={p.name}
      loading="lazy"
      width={size}
      height={size}
      style={{ background: bg }}
      onError={() => setFailed(true)}
    />
  );
}

// Team crest drawn as SVG in the team's colors: a shield with the abbreviation and basketball seams.
export function TeamLogo({ abbr, name, colors, size }: { abbr: string; name: string; colors: [string, string]; size: number }) {
  const [primary, secondary] = colors;
  const id = `crest-${abbr}`;
  // A black or primary-colored trim would vanish on the dark UI, so fall back to light grey.
  const trim = secondary.toLowerCase() === primary.toLowerCase() || lum(secondary) < 40 ? '#d1d5db' : secondary;
  return (
    <svg className="team-logo" width={(size * 40) / 44} height={size} viewBox="0 0 40 44" role="img" aria-label={name}>
      <title>{name}</title>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={shade(primary, 0.18)} />
          <stop offset="1" stopColor={shade(primary, -0.28)} />
        </linearGradient>
      </defs>
      <path d="M20 1.5 L37.5 6.5 V22 C37.5 32.5 30 39.5 20 42.5 C10 39.5 2.5 32.5 2.5 22 V6.5 Z" fill={`url(#${id})`} stroke={trim} strokeWidth="2.2" strokeLinejoin="round" />
      <g fill="none" stroke={textOn(primary)} strokeOpacity="0.14" strokeWidth="1.2">
        <path d="M20 4 V40" />
        <path d="M5 22 H35" />
        <path d="M8 9 C15 15 15 29 8 35" />
        <path d="M32 9 C25 15 25 29 32 35" />
      </g>
      <text
        x="20" y="27.5" textAnchor="middle" fill={textOn(primary)}
        fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif" fontWeight="800" fontSize="14.5" letterSpacing="0.3"
        stroke={shade(primary, -0.45)} strokeWidth="0.6" paintOrder="stroke"
      >{abbr}</text>
    </svg>
  );
}

export function TeamBadge({ league, abbr, size = 28 }: { league: League; abbr: string; size?: number }) {
  const t = league.teams[abbr];
  if (!t) return <span className="muted">{abbr}</span>;
  return <TeamLogo abbr={abbr} name={t.name} colors={t.colors} size={size} />;
}

// Lighten (amt > 0) or darken (amt < 0) a hex color.
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(ch);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
}

function textOn(hex: string) {
  return lum(hex) > 150 ? '#111' : '#fff';
}

export function TeamLink({ league, abbr, full = false }: { league: League; abbr: string; full?: boolean }) {
  const t = league.teams[abbr];
  if (!t) return <span className="muted">{abbr === 'FA' ? 'Free Agent' : abbr}</span>;
  return (
    <a className="team-link" onClick={() => go({ name: 'roster', team: abbr })}>
      <TeamBadge league={league} abbr={abbr} size={18} /> {full ? t.name : ''}
    </a>
  );
}

export function PlayerLink({ league, id, showImg = false }: { league: League; id: string; showImg?: boolean }) {
  const p = league.players[id];
  if (!p) return <span className="muted">Retired player</span>;
  return (
    <a className="player-link" onClick={() => go({ name: 'player', id })}>
      {showImg && <Headshot p={p} size={28} league={league} />}
      <span>{p.name}</span>
      {p.injury && <span className="inj" title={`${p.injury.type} (${p.injury.games} games)`}>+</span>}
    </a>
  );
}

// Hot / cold streak and rust, as a short label + color (null when unremarkable).
export function formLabel(p: Player): [string, string, string] | null {
  const f = p.form ?? 0, r = p.rust ?? 0;
  if (r >= 0.25) return ['Rusty', '#94a3b8', 'Hasn\'t played much lately: shoots worse and turns it over more until he gets minutes.'];
  if (f >= 0.3) return ['🔥 Hot', '#f97316', 'Confident after strong recent games: shooting better.'];
  if (f <= -0.3) return ['🧊 Cold', '#60a5fa', 'Struggling lately: confidence is down and his shooting suffers.'];
  return null;
}

export function rColor(v: number) {
  if (v >= 85) return '#22c55e';
  if (v >= 72) return '#84cc16';
  if (v >= 60) return '#eab308';
  if (v >= 45) return '#f97316';
  return '#ef4444';
}

export function Ovr({ p, value }: { p?: Player; value?: number }) {
  const v = value ?? ovr(p!.ratings);
  return <span className="ovr" style={{ background: rColor(v) }}>{v}</span>;
}

export function Bar({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="bar-row" title={hint}>
      <span className="bar-label">{label}</span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${value}%`, background: rColor(value) }} /></div>
      <span className="bar-value">{Math.round(value)}</span>
    </div>
  );
}

export function Card({ title, children, right, className = '' }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && <header className="card-head"><h3>{title}</h3>{right}</header>}
      {children}
    </section>
  );
}

export const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '0.0');
export const pct = (m: number, a: number) => (a > 0 ? (m / a).toFixed(3).replace(/^0/, '') : '—');

export function perGameRow(s: SeasonLine) {
  const g = Math.max(1, s.g);
  return {
    g: s.g, gs: s.gs, min: s.min / g, pts: s.pts / g, reb: (s.orb + s.drb) / g, orb: s.orb / g, ast: s.ast / g,
    stl: s.stl / g, blk: s.blk / g, tov: s.tov / g, pf: s.pf / g, fgp: s.fga ? s.fgm / s.fga : 0,
    tpp: s.tpa ? s.tpm / s.tpa : 0, ftp: s.fta ? s.ftm / s.fta : 0, tpm: s.tpm / g, pm: s.pm / g,
    ts: s.fga + s.fta ? s.pts / (2 * (s.fga + 0.44 * s.fta)) : 0,
  };
}

export function moraleLabel(m: number) {
  if (m >= 85) return ['Thrilled', '#22c55e'];
  if (m >= 70) return ['Happy', '#84cc16'];
  if (m >= 50) return ['Content', '#eab308'];
  if (m >= 35) return ['Frustrated', '#f97316'];
  return ['Unhappy', '#ef4444'];
}

export type SortDir = 1 | -1;
export function useSort<K extends string>(initial: K, dir: SortDir = -1) {
  const [key, setKey] = useState<K>(initial);
  const [d, setD] = useState<SortDir>(dir);
  const toggle = (k: K) => {
    if (k === key) setD((x) => (x === 1 ? -1 : 1) as SortDir);
    else { setKey(k); setD(-1); }
  };
  return { key, dir: d, toggle };
}

export function Th({ k, sort, children, title }: { k: string; sort: { key: string; dir: SortDir; toggle: (k: never) => void }; children: ReactNode; title?: string }) {
  const active = sort.key === k;
  return (
    <th className={`sortable ${active ? 'active' : ''}`} title={title} onClick={() => sort.toggle(k as never)}>
      {children}{active ? (sort.dir === -1 ? ' ▾' : ' ▴') : ''}
    </th>
  );
}
