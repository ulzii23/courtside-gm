import { shotProfile, ZONES, type Zone } from '../engine/sim';
import { changed } from '../store';
import { FOCUS_KEYS, type Focus, type FocusKey, type Player } from '../types';
import { Card } from './common';

// Per-player offensive role: a level for each part of his game. Several can be pushed at once.

export const FOCUS_LABELS: Record<FocusKey, [string, string]> = {
  three: ['3-pointers', 'How often he pulls up from deep.'],
  mid: ['Mid-range', 'Pull-ups and elbow jumpers. Few fouls drawn, rarely blocked.'],
  post: ['Post-ups', 'Back-to-the-basket work on the block.'],
  rim: ['Drives & dunks', 'Attacking the rim: best percentage and most free throws, but more blocks.'],
  shoot: ['Shot volume', 'How much of the offense he takes on. Big egos hate being told to shoot less.'],
  pass: ['Playmaking', 'Looks to set up teammates: more assists, fewer own shots, a few more turnovers.'],
  crash: ['Crash the boards', 'Chases offensive rebounds. Tires him out a little faster.'],
};
const LEVELS: [number, string][] = [[-2, 'Never'], [-1, 'Less'], [0, 'Natural'], [1, 'More'], [2, 'Max']];
const ZONE_LABEL: Record<Zone, string> = { rim: 'Rim', post: 'Post', mid: 'Mid', three: '3PT' };

export const PRESETS: [string, Focus][] = [
  ['Natural', {}],
  ['Sniper', { three: 2, mid: -1, post: -2 }],
  ['Mid-range maestro', { mid: 2, three: -1, rim: -1 }],
  ['Slasher', { rim: 2, three: -1, mid: -1 }],
  ['Post scorer', { post: 2, rim: 1, three: -2 }],
  ['Floor general', { pass: 2, shoot: -1 }],
  ['Glass cleaner', { crash: 2, rim: 1, three: -2, shoot: -1 }],
  ['Alpha scorer', { shoot: 2, pass: -1 }],
];

const same = (a: Focus, b: Focus) => FOCUS_KEYS.every((k) => (a[k] ?? 0) === (b[k] ?? 0));

// Short label for tables: the preset name, or the keys pushed up.
export function roleSummary(f: Focus | undefined): string {
  if (!f) return 'Natural';
  const preset = PRESETS.find(([, pf]) => same(pf, f));
  if (preset) return preset[0];
  const up = FOCUS_KEYS.filter((k) => (f[k] ?? 0) > 0).map((k) => FOCUS_LABELS[k][0]);
  return up.length ? up.join(' + ') : 'Custom';
}

export function OffenseRole({ p, editable }: { p: Player; editable: boolean }) {
  const focus = p.focus ?? {};
  const prof = shotProfile(p);
  const set = (f: Focus) => {
    const clean: Focus = {};
    for (const k of FOCUS_KEYS) if (f[k]) clean[k] = f[k];
    p.focus = Object.keys(clean).length ? clean : undefined;
    changed();
  };

  return (
    <Card title="Offensive role" right={<span className="muted small">{roleSummary(p.focus)}</span>}>
      {editable && (
        <div className="role-presets">
          {PRESETS.map(([name, f]) => (
            <button key={name} className={`chip ${same(f, focus) ? 'on' : ''}`} onClick={() => set(f)}>{name}</button>
          ))}
        </div>
      )}
      <div className="role-rows">
        {FOCUS_KEYS.map((k) => (
          <div key={k} className="role-row" title={FOCUS_LABELS[k][1]}>
            <span className="role-label">{FOCUS_LABELS[k][0]}</span>
            <div className="seg">
              {LEVELS.map(([v, l]) => (
                <button key={v} disabled={!editable} className={(focus[k] ?? 0) === v ? 'on' : ''} onClick={() => set({ ...focus, [k]: v })}>{l}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <h4>Shot mix</h4>
      <table className="tbl shot-mix">
        <thead><tr><th></th>{ZONES.map((z) => <th key={z}>{ZONE_LABEL[z]}</th>)}</tr></thead>
        <tbody>
          <tr><td className="muted">Natural</td>{ZONES.map((z) => <td key={z}>{Math.round(prof.natural[z] * 100)}%</td>)}</tr>
          <tr><td>With role</td>{ZONES.map((z) => <td key={z}><strong>{Math.round(prof.share[z] * 100)}%</strong></td>)}</tr>
          <tr><td className="muted">Make %</td>{ZONES.map((z) => <td key={z}>{(prof.pct[z] * 100).toFixed(0)}%</td>)}</tr>
        </tbody>
      </table>
      <p className="muted small">
        Pushing a player into shots he rarely takes costs some accuracy, and a lineup that stops shooting threes lets the defense crowd the paint.
        Your team systems and the opponent's defense shift the mix further during games.
      </p>
    </Card>
  );
}
