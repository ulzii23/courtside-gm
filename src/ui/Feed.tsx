import { useState } from 'react';
import { seasonLabel } from '../data/teams';
import { handleOf } from '../engine/buzz';
import type { League, NewsItem } from '../types';
import { Card, Headshot, PlayerLink, TeamBadge } from './common';

// News + social feed, and the weekly / monthly honors.

const OUTLETS: Record<string, string> = { '@CourtsideInsider': 'Insider', '@HoopsWireDaily': 'Wire' };

function FeedItem({ league, n }: { league: League; n: NewsItem }) {
  const p = n.pid ? league.players[n.pid] : undefined;
  const mine = n.team === league.userTeam;
  const when = <span className="muted small">{seasonLabel(n.season)} · day {n.day + 1}</span>;
  if (n.kind === 'social') {
    const outlet = n.by ? OUTLETS[n.by] : undefined;
    const isPlayer = !!p && n.by === handleOf(p);
    return (
      <li className={`feed-post ${mine ? 'mine' : ''}`}>
        <div className="feed-avatar">
          {isPlayer && p ? <Headshot p={p} size={34} league={league} /> : <span className={outlet ? 'outlet' : 'fan'}>{outlet ? '📰' : '💬'}</span>}
        </div>
        <div className="feed-body">
          <div className="feed-head">
            <strong>{isPlayer && p ? p.name : n.by}</strong>
            {isPlayer && <span className="muted small">{n.by}</span>}
            {outlet && <span className="feed-tag">{outlet}</span>}
            {n.team && league.teams[n.team] && <TeamBadge league={league} abbr={n.team} size={14} />}
            {when}
          </div>
          <div className="feed-text">{n.text}</div>
        </div>
      </li>
    );
  }
  return (
    <li className={`${n.kind === 'award' ? 'feed-award' : ''} ${mine ? 'mine' : ''}`}>
      {when} {n.text}
    </li>
  );
}

type Filter = 'all' | 'social' | 'award' | 'news' | 'mine';
const FILTERS: [Filter, string][] = [['all', 'All'], ['social', 'Social'], ['award', 'Awards'], ['news', 'Headlines'], ['mine', 'My team']];

export function NewsFeed({ league, limit, filters = false }: { league: League; limit?: number; filters?: boolean }) {
  const [f, setF] = useState<Filter>('all');
  const items = league.news.filter((n) =>
    f === 'all' ? true : f === 'mine' ? n.team === league.userTeam : f === 'news' ? !n.kind : n.kind === f,
  );
  return (
    <>
      {filters && (
        <div className="seg feed-filters">
          {FILTERS.map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}
        </div>
      )}
      {!items.length && <p className="muted">Nothing here yet.</p>}
      <ul className="news feed">{items.slice(0, limit).map((n, i) => <FeedItem key={i} league={league} n={n} />)}</ul>
    </>
  );
}

const HONOR_TITLE = { POW: 'Player of the Week', POM: 'Player of the Month', ROM: 'Rookie of the Month' } as const;

export function Honors({ league }: { league: League }) {
  const hs = (league.honors ?? []).filter((h) => h.season === league.season);
  const latest = (['POW', 'POM', 'ROM'] as const).flatMap((kind) => {
    const first = hs.find((h) => h.kind === kind);
    return first ? hs.filter((h) => h.kind === kind && h.label === first.label) : [];
  });
  return (
    <Card title="Players of the week & month">
      {!latest.length && <p className="muted">The first Player of the Week is named after week 1.</p>}
      {latest.map((h) => (
        <div key={`${h.kind}-${h.conf}`} className={`honor-row ${h.team === league.userTeam ? 'mine' : ''}`}>
          {league.players[h.pid] && <Headshot p={league.players[h.pid]} size={36} league={league} />}
          <div>
            <div className="small muted">{h.conf} {HONOR_TITLE[h.kind]} · {h.label}</div>
            <div className="honor-name"><PlayerLink league={league} id={h.pid} /> <TeamBadge league={league} abbr={h.team} size={14} /></div>
            <div className="small muted">{h.line}</div>
          </div>
        </div>
      ))}
    </Card>
  );
}
