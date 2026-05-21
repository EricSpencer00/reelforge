import { useEffect, useState } from 'react';
import { api, fileUrl, type Reel } from '../lib/api';

export function Publish() {
  const [reel, setReel] = useState<Reel | null>(null);
  const [caption, setCaption] = useState('');
  const [ig, setIg] = useState(true);
  const [fb, setFb] = useState(true);
  const [tt, setTt] = useState(true);
  const [tiktokDirect, setTiktokDirect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [metaStatus, setMetaStatus] = useState<any>({ connected: false });
  const [ttStatus, setTtStatus] = useState<any>({ connected: false });

  useEffect(() => {
    const raw = sessionStorage.getItem('publishReel');
    if (raw) {
      const r: Reel = JSON.parse(raw);
      setReel(r);
      setCaption(r.script?.caption || r.script?.cta || '');
    } else {
      api.library.listReels().then((reels) => {
        if (reels.length) {
          setReel(reels[0]);
          setCaption(reels[0].script?.caption || reels[0].script?.cta || '');
        }
      });
    }
    api.oauth.meta.status().then(setMetaStatus);
    api.oauth.tiktok.status().then(setTtStatus);
  }, []);

  async function publish() {
    if (!reel) return;
    setBusy(true);
    setResults({});
    const r: Record<string, { ok: boolean; msg: string }> = {};

    if (ig) {
      try {
        const out = await api.publish.instagram({ videoPath: reel.path, caption });
        r.instagram = { ok: true, msg: `Posted (${out.postId})` };
      } catch (e: any) {
        r.instagram = { ok: false, msg: e.message };
      }
      setResults({ ...r });
    }
    if (fb) {
      try {
        const out = await api.publish.facebook({ videoPath: reel.path, caption });
        r.facebook = { ok: true, msg: `Posted (${out.postId})` };
      } catch (e: any) {
        r.facebook = { ok: false, msg: e.message };
      }
      setResults({ ...r });
    }
    if (tt) {
      try {
        const out = await api.publish.tiktok({ videoPath: reel.path, caption, directPost: tiktokDirect });
        r.tiktok = { ok: true, msg: out.note || `Posted (${out.publishId})` };
      } catch (e: any) {
        r.tiktok = { ok: false, msg: e.message };
      }
      setResults({ ...r });
    }
    setBusy(false);
  }

  if (!reel) {
    return (
      <>
        <h1>Publish</h1>
        <p className="subtitle">Pick a reel from Review first.</p>
      </>
    );
  }

  return (
    <>
      <h1>Publish</h1>
      <p className="subtitle">One click pushes the same reel to every connected platform.</p>

      <div className="review-grid">
        <video src={fileUrl(reel.path)} controls loop className="preview-video" />

        <div>
          <h2>Caption</h2>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            style={{ minHeight: 100, marginBottom: 20 }}
          />

          <h2>Destinations</h2>
          <div className="platform-card">
            <div className="left">
              <div className="icon ig">IG</div>
              <div>
                <div style={{ fontWeight: 600 }}>Instagram Reels</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {metaStatus.connected ? `Account ${metaStatus.igUserId || '—'}` : 'Not connected'}
                </div>
              </div>
            </div>
            <input type="checkbox" checked={ig} disabled={!metaStatus.connected || !metaStatus.igUserId} onChange={(e) => setIg(e.target.checked)} style={{ width: 20, height: 20 }} />
          </div>

          <div className="platform-card">
            <div className="left">
              <div className="icon fb">f</div>
              <div>
                <div style={{ fontWeight: 600 }}>Facebook Reels</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {metaStatus.connected ? `Page ${metaStatus.fbPageId || '—'}` : 'Not connected'}
                </div>
              </div>
            </div>
            <input type="checkbox" checked={fb} disabled={!metaStatus.connected || !metaStatus.fbPageId} onChange={(e) => setFb(e.target.checked)} style={{ width: 20, height: 20 }} />
          </div>

          <div className="platform-card">
            <div className="left">
              <div className="icon tt">TT</div>
              <div>
                <div style={{ fontWeight: 600 }}>TikTok</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {ttStatus.connected ? `${tiktokDirect ? 'Direct post' : 'Upload to inbox'}` : 'Not connected'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={tiktokDirect} onChange={(e) => setTiktokDirect(e.target.checked)} />
                direct
              </label>
              <input type="checkbox" checked={tt} disabled={!ttStatus.connected} onChange={(e) => setTt(e.target.checked)} style={{ width: 20, height: 20 }} />
            </div>
          </div>

          <button className="primary" onClick={publish} disabled={busy} style={{ marginTop: 20, width: '100%', padding: '12px' }}>
            {busy ? 'Publishing…' : `🚀 Publish to ${[ig && 'IG', fb && 'FB', tt && 'TikTok'].filter(Boolean).join(' + ')}`}
          </button>

          {Object.entries(results).map(([k, v]) => (
            <div key={k} style={{ marginTop: 10, padding: 10, background: 'var(--bg-2)', borderRadius: 6, fontSize: 12 }}>
              <span className={`badge ${v.ok ? 'ok' : 'err'}`}>{k}</span> {v.msg}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
