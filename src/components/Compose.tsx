import { useEffect, useState } from 'react';
import { Terminal } from './Terminal';
import { api, fileUrl, type Clip, type MusicTrack, type Script } from '../lib/api';

const DEFAULT_SCRIPT: Script = {
  hook: 'running a shopify store in 2026:',
  lines: [
    '1. pay $39/mo to exist',
    '2. pay $30 per app to do anything',
    '3. pay 2% per sale because reasons',
    '4. monthly bill: $2400 for 3 customers',
  ],
  cta: 'or pay $0 + cents per sale at instxnt.xyz',
  caption: 'how is anyone still on shopify? 😤 #ecom #shopify #indiehackers',
  perLineSeconds: 3,
};

export function Compose({ onComposed }: { onComposed: () => void }) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [music, setMusic] = useState<MusicTrack[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [musicId, setMusicId] = useState<string | null>(null);
  const [scriptJson, setScriptJson] = useState<string>(JSON.stringify(DEFAULT_SCRIPT, null, 2));
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState<null | 'gen' | 'render'>(null);
  const [progress, setProgress] = useState<{ percent: number; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'api' | 'terminal'>('api');

  useEffect(() => {
    api.library.list().then(setClips);
    api.library.listMusic().then(setMusic);
    const unsub = api.compose.onProgress((p) => setProgress(p));
    return () => unsub();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function generateScript() {
    setBusy('gen');
    setError(null);
    try {
      const result = await api.anthropic.generateScript({ brief });
      setScriptJson(JSON.stringify(result, null, 2));
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }

  async function render() {
    setBusy('render');
    setError(null);
    setProgress({ percent: 0, stage: 'starting' });
    try {
      const script = JSON.parse(scriptJson);
      await api.compose.render({
        clipIds: selected,
        script,
        musicId: musicId || undefined,
      });
      onComposed();
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setBusy(null);
    }
  }

  const canRender = selected.length > 0 && !busy;

  return (
    <>
      <h1>Compose</h1>
      <p className="subtitle">
        Pick clips, write the script (or generate one), and render. Two ways to get a script: ask Claude via the embedded terminal, or hit Generate.
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className={mode === 'api' ? 'primary' : ''} onClick={() => setMode('api')}>Quick generate</button>
        <button className={mode === 'terminal' ? 'primary' : ''} onClick={() => setMode('terminal')}>Claude Code terminal</button>
      </div>

      <div className="split">
        <div className="panel">
          <h2>Script</h2>
          {mode === 'api' ? (
            <>
              <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Brief</label>
              <input
                placeholder="e.g. shopify pricing is insane, make a 4-line bit"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <button onClick={generateScript} disabled={busy === 'gen' || !brief} style={{ marginBottom: 12 }}>
                {busy === 'gen' ? 'Generating…' : '✨ Generate with Claude'}
              </button>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 240, marginBottom: 12 }}>
              <Terminal cwd={undefined} />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
                Ask Claude for a script JSON, then paste the result below.
              </p>
            </div>
          )}
          <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Script JSON</label>
          <textarea
            value={scriptJson}
            onChange={(e) => setScriptJson(e.target.value)}
            style={{ flex: 1, minHeight: 200 }}
          />
        </div>

        <div className="panel">
          <h2>
            Clips ({selected.length} selected)
            <button onClick={() => setSelected(clips.map((c) => c.id))} style={{ fontSize: 11, padding: '4px 10px' }}>
              Select all
            </button>
          </h2>
          <div style={{ overflow: 'auto', flex: 1 }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
              {clips.map((c) => (
                <div
                  key={c.id}
                  className={`card ${selected.includes(c.id) ? 'selected' : ''}`}
                  onClick={() => toggle(c.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="thumb">
                    <video src={fileUrl(c.path)} muted />
                  </div>
                  <div className="meta">
                    <div className="name">{c.filename}</div>
                    <div className="sub">{c.durationSec?.toFixed(1)}s</div>
                  </div>
                </div>
              ))}
              {clips.length === 0 && (
                <div style={{ gridColumn: '1/-1', color: 'var(--muted)' }}>
                  No clips in library. Add some on the Library tab.
                </div>
              )}
            </div>
          </div>

          <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)', marginTop: 14 }}>Music</label>
          <select value={musicId || ''} onChange={(e) => setMusicId(e.target.value || null)}>
            <option value="">No music</option>
            {music.map((m) => (
              <option key={m.id} value={m.id}>{m.filename}</option>
            ))}
          </select>

          {progress && (
            <>
              <div className="progress" style={{ marginTop: 14 }}>
                <div style={{ width: `${progress.percent}%` }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {progress.stage} ({Math.round(progress.percent)}%)
              </div>
            </>
          )}
          {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{error}</div>}

          <button
            className="primary"
            disabled={!canRender}
            onClick={render}
            style={{ marginTop: 14 }}
          >
            {busy === 'render' ? 'Rendering…' : '🎬 Render reel'}
          </button>
        </div>
      </div>
    </>
  );
}
