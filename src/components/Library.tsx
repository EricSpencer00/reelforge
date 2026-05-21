import { useEffect, useRef, useState } from 'react';
import { api, fileUrl, type Clip, type MusicTrack } from '../lib/api';

export function Library() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [music, setMusic] = useState<MusicTrack[]>([]);
  const [drag, setDrag] = useState(false);
  const [view, setView] = useState<'video' | 'music'>('video');

  async function refresh() {
    setClips(await api.library.list());
    setMusic(await api.library.listMusic());
  }

  useEffect(() => { refresh(); }, []);

  async function importPicked() {
    const paths = await api.app.pickFiles({
      multiple: true,
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm'] }],
    });
    if (paths.length) {
      await api.library.import(paths);
      refresh();
    }
  }

  async function importMusicPicked() {
    const paths = await api.app.pickFiles({
      multiple: true,
      filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'aac'] }],
    });
    if (paths.length) {
      await api.library.importMusic(paths);
      refresh();
    }
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map((f) => (f as any).path).filter(Boolean);
    if (!paths.length) return;
    const videoExts = ['.mp4', '.mov', '.m4v', '.webm'];
    const audioExts = ['.mp3', '.m4a', '.wav', '.aac'];
    const videos = paths.filter((p) => videoExts.some((e) => p.toLowerCase().endsWith(e)));
    const audios = paths.filter((p) => audioExts.some((e) => p.toLowerCase().endsWith(e)));
    if (videos.length) await api.library.import(videos);
    if (audios.length) await api.library.importMusic(audios);
    refresh();
  }

  return (
    <>
      <h1>Library</h1>
      <p className="subtitle">Drop in B-roll clips and royalty-free music. These get reused across every reel.</p>

      <div className="row" style={{ marginBottom: 18 }}>
        <button className={view === 'video' ? 'primary' : ''} onClick={() => setView('video')}>Video clips ({clips.length})</button>
        <button className={view === 'music' ? 'primary' : ''} onClick={() => setView('music')}>Music ({music.length})</button>
        <div style={{ flex: 1 }} />
        {view === 'video'
          ? <button onClick={importPicked}>+ Add video</button>
          : <button onClick={importMusicPicked}>+ Add music</button>}
      </div>

      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragEnter={() => setDrag(true)}
        onDragLeave={() => setDrag(false)}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDrop={onDrop}
      >
        Drop {view === 'video' ? 'videos' : 'audio files'} here
      </div>

      {view === 'video' ? (
        <div className="grid">
          {clips.map((c) => (
            <div key={c.id} className="card">
              <div className="thumb">
                <video src={fileUrl(c.path)} muted />
              </div>
              <div className="meta">
                <div className="name">{c.filename}</div>
                <div className="sub">{c.width}×{c.height} · {c.durationSec?.toFixed(1)}s</div>
                <button
                  className="ghost"
                  style={{ marginTop: 6, fontSize: 11, padding: '4px 8px' }}
                  onClick={async () => { await api.library.remove(c.id); refresh(); }}
                >Remove</button>
              </div>
            </div>
          ))}
          {clips.length === 0 && (
            <div style={{ gridColumn: '1/-1', color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
              No clips yet. Shoot 10–15 short B-roll clips on your phone (typing, walking, coffee, etc.) and drop them here.
            </div>
          )}
        </div>
      ) : (
        <div className="grid">
          {music.map((m) => (
            <div key={m.id} className="card">
              <div className="thumb">🎵</div>
              <div className="meta">
                <div className="name">{m.filename}</div>
                <div className="sub">{m.durationSec?.toFixed(1)}s</div>
              </div>
            </div>
          ))}
          {music.length === 0 && (
            <div style={{ gridColumn: '1/-1', color: 'var(--muted)', textAlign: 'center', padding: 32 }}>
              No music yet. Grab tracks from mixkit.co, pixabay.com/music, or uppbeat.io and drop them here.
            </div>
          )}
        </div>
      )}
    </>
  );
}
