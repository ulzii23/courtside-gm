import { useState, type ReactNode } from 'react';
import type { League, Player, SeasonLine } from '../types';
import { headshotUrl, logoUrl } from '../data/teams';
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

export function TeamLogo({ abbr, season, name, size, fallback }: { abbr: string; season: number; name: string; size: number; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      className="team-logo"
      src={logoUrl(abbr, season)}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function TeamBadge({ league, abbr, size = 28 }: { league: League; abbr: string; size?: number }) {
  const t = league.teams[abbr];
  if (!t) return <span className="muted">{abbr}</span>;
  return <TeamLogo abbr={abbr} season={league.season} name={t.name} size={size} fallback={<ColorBadge league={league} abbr={abbr} size={size} />} />;
}

function ColorBadge({ league, abbr, size }: { league: League; abbr: string; size: number }) {
  const t = league.teams[abbr];
  return (
    <span
      className="team-badge"
      title={t.name}
      style={{ background: t.colors[0], color: textOn(t.colors[0]), borderColor: t.colors[1], width: size * 1.6, height: size, fontSize: size * 0.38 }}
    >
      {t.abbr}
    </span>
  );
}

function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  return lum > 150 ? '#111' : '#fff';
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
