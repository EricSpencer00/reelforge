import { useEffect, useState } from 'react';
import { api, fileUrl, type Reel } from '../lib/api';

export function Review({ onPublishRequest }: { onPublishRequest: () => void }) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [selected, setSelected] = useState<Reel | null>(null);

  async function refresh() {
    const list = await api.library.listReels();
    setReels(list);
    if (!selected && list.length) setSelected(list[0]);
  }
  useEffect(() => { refresh(); }, []);

  function setForPublish(reel: Reel) {
    sessionStorage.setItem('publishReel', JSON.stringify(reel));
    onPublishRequest();
  }

  return (
    <>
      <h1>Review</h1>
      <p className="subtitle">Watch, approve, and send to Publish. Or regenerate from Compose if it's not landing.</p>

      <div className="review-grid">
        <div>
          <h2>Rendered reels ({reels.length})</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 240px)', overflow: 'auto' }}>
            {reels.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelected(r)}
                className={`card ${selected?.id === r.id ? 'selected' : ''}`}
                style={{ cursor: 'pointer', flexDirection: 'row', alignItems: 'center' }}
              >
                <div style={{ width: 60, height: 90, background: '#000', flexShrink: 0 }}>
                  <video src={fileUrl(r.path)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className="meta" style={{ flex: 1 }}>
                  <div className="name">{r.script?.hook?.slice(0, 40) || r.filename}</div>
                  <div className="sub">{new Date(r.createdAt).toLocaleString()}</div>
                  <div>
                    <span className={`badge ${r.status === 'published' ? 'ok' : ''}`}>{r.status}</span>
                  </div>
                </div>
              </div>
            ))}
            {reels.length === 0 && (
              <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>
                No reels yet — render one from Compose.
              </div>
            )}
          </div>
        </div>

        {selected ? (
          <div>
            <h2>{selected.script?.hook}</h2>
            <video
              src={fileUrl(selected.path)}
              controls
              autoPlay
              loop
              className="preview-video"
            />
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Caption</label>
              <p style={{ background: 'var(--bg-2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                {selected.script?.caption || selected.script?.cta}
              </p>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="primary" onClick={() => setForPublish(selected)}>
                🚀 Send to Publish
              </button>
              <button onClick={() => api.app.reveal(selected.path)}>Reveal in Finder</button>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--muted)' }}>Select a reel to preview.</div>
        )}
      </div>
    </>
  );
}
