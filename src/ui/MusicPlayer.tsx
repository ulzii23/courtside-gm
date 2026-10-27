import { useEffect, useRef, useState } from 'react';

// Background soundtrack from a YouTube playlist, shuffled, with a 2K-style "Now Playing" banner.
const PLAYLIST_ID = 'PLeWhBDVc5n5k';
const FIRST_VIDEO = 'x9WO2ieJMYk';
const MUSIC_KEY = 'cgm-music';
const VOLUME_KEY = 'cgm-music-volume';

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  playVideoAt(i: number): void;
  setShuffle(on: boolean): void;
  setLoop(on: boolean): void;
  setVolume(v: number): void;
  getPlaylist(): string[] | null;
  getVideoData(): { title: string; author: string; video_id: string };
  getPlayerState(): number;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: object) => YTPlayer; PlayerState: Record<string, number> };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
}

const read = (k: string, fallback: string) => { try { return localStorage.getItem(k) ?? fallback; } catch { return fallback; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

// "Artist - Song (Official Video)" -> { song, artist }. Falls back to the channel name.
export function parseTrack(title: string, channel: string): { song: string; artist: string } {
  const clean = (s: string) => s
    .replace(/\s*[([][^)\]]*(official|video|audio|lyric|lyrics|visualizer|hd|4k|remaster|explicit|clean)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[|｜].*$/, '') // "Song | Some Show" -> "Song"
    .replace(/\s+/g, ' ')
    .trim();
  const t = clean(title);
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { artist: m[1].trim(), song: m[2].replace(/^["']|["']$/g, '').trim() };
  // "Song by Artist"
  const by = t.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) return { song: by[1].trim(), artist: by[2].replace(/\s*[([][^)\]]*[)\]]/g, '').trim() };
  return { song: t, artist: channel.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim() };
}

export function MusicPlayer() {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const started = useRef(false);
  const trackId = useRef('');
  const [on, setOn] = useState(read(MUSIC_KEY, 'on') !== 'off');
  const [volume, setVolume] = useState(Number(read(VOLUME_KEY, '35')));
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState<{ song: string; artist: string; id: string } | null>(null);
  const [toast, setToast] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const onRef = useRef(on);
  onRef.current = on;

  // Create the player once.
  useEffect(() => {
    let cancelled = false;
    loadApi().then(() => {
      if (cancelled || !host.current || !window.YT) return;
      player.current = new window.YT.Player(host.current, {
        width: 200,
        height: 113,
        videoId: FIRST_VIDEO,
        playerVars: { listType: 'playlist', list: PLAYLIST_ID, autoplay: 0, controls: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            const p = player.current!;
            p.setShuffle(true);
            p.setLoop(true);
            p.setVolume(volume);
            setReady(true);
          },
          onStateChange: (e: { data: number }) => {
            const p = player.current!;
            setPlaying(e.data === 1);
            if (e.data === 1) {
              const d = p.getVideoData();
              if (trackId.current !== d.video_id) {
                trackId.current = d.video_id;
                setTrack({ ...parseTrack(d.title, d.author), id: d.video_id });
                setToast(true);
              }
            }
          },
          onError: () => player.current?.nextVideo(), // skip videos that can't be embedded
        },
      });
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Browsers only allow sound after the user interacts, so start on the first tap or click.
  useEffect(() => {
    if (!ready) return;
    const start = () => {
      if (started.current || !onRef.current) return;
      started.current = true;
      const p = player.current!;
      const list = p.getPlaylist();
      if (list?.length) p.playVideoAt(Math.floor(Math.random() * list.length));
      else p.playVideo();
    };
    document.addEventListener('pointerdown', start, { capture: true });
    return () => document.removeEventListener('pointerdown', start, { capture: true });
  }, [ready]);

  // Hide the "Now Playing" banner after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(false), 5000);
    return () => clearTimeout(t);
  }, [toast, track?.id]);

  const toggleMusic = () => {
    const next = !on;
    setOn(next);
    write(MUSIC_KEY, next ? 'on' : 'off');
    const p = player.current;
    if (!p) return;
    if (next) { started.current = true; p.playVideo(); } else p.pauseVideo();
  };
  const next = () => {
    const p = player.current;
    if (!p) return;
    if (!on) { setOn(true); write(MUSIC_KEY, 'on'); }
    started.current = true;
    p.nextVideo();
  };
  const playPause = () => {
    const p = player.current;
    if (!p) return;
    started.current = true;
    if (playing) p.pauseVideo(); else { if (!on) { setOn(true); write(MUSIC_KEY, 'on'); } p.playVideo(); }
  };
  const changeVolume = (v: number) => {
    setVolume(v);
    write(VOLUME_KEY, String(v));
    player.current?.setVolume(v);
  };

  const thumb = track ? `https://i.ytimg.com/vi/${track.id}/mqdefault.jpg` : undefined;

  return (
    <>
      {toast && track && on && (
        <div className="now-playing-toast" onClick={() => setToast(false)}>
          <img src={thumb} alt="" />
          <div>
            <div className="np-label">♪ NOW PLAYING</div>
            <div className="np-song">{track.song}</div>
            <div className="np-artist">{track.artist}</div>
          </div>
        </div>
      )}

      <div className={`music-dock ${expanded ? 'expanded' : ''}`}>
        <div className={`music-video ${showVideo && expanded ? 'visible' : ''}`}><div ref={host} /></div>
        <div className="music-bar">
          <button className="music-art" onClick={() => setExpanded((x) => !x)} title={expanded ? 'Collapse' : 'Expand music player'}>
            {thumb ? <img src={thumb} alt="" /> : <span>♪</span>}
          </button>
          <div className="music-info" onClick={() => setExpanded((x) => !x)}>
            <div className="music-song">{!on ? 'Music off' : track?.song ?? (ready ? 'Tap to start' : 'Loading…')}</div>
            {expanded && on && track && <div className="music-artist">{track.artist}</div>}
          </div>
          <button className="icon-btn" title={playing ? 'Pause' : 'Play'} onClick={playPause} disabled={!ready}>{playing ? '⏸' : '▶'}</button>
          <button className="icon-btn" title="Next song" onClick={next} disabled={!ready}>⏭</button>
          {expanded && <button className="icon-btn" title={on ? 'Turn music off' : 'Turn music on'} onClick={toggleMusic}>{on ? '🎵' : '🔕'}</button>}
        </div>
        {expanded && (
          <div className="music-extra">
            <label>Volume <input type="range" min={0} max={100} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} /></label>
            <label className="toggle"><input type="checkbox" checked={showVideo} onChange={(e) => setShowVideo(e.target.checked)} /> Show video</label>
            <span className="muted small">Shuffle on</span>
          </div>
        )}
      </div>
    </>
  );
}
