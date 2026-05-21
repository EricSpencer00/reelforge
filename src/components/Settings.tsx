import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function Settings({ onChange }: { onChange?: () => void }) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [metaAppId, setMetaAppId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [tiktokKey, setTiktokKey] = useState('');
  const [tiktokSecret, setTiktokSecret] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [metaStatus, setMetaStatus] = useState<any>({ connected: false });
  const [ttStatus, setTtStatus] = useState<any>({ connected: false });
  const [saveMsg, setSaveMsg] = useState('');
  const [connecting, setConnecting] = useState<'meta' | 'tiktok' | null>(null);

  async function refresh() {
    setAnthropicKey((await api.settings.getSecret('anthropic_api_key')) || '');
    setMetaAppId((await api.settings.get('metaAppId')) || '');
    setMetaAppSecret((await api.settings.getSecret('meta_app_secret')) || '');
    setTiktokKey((await api.settings.get('tiktokClientKey')) || '');
    setTiktokSecret((await api.settings.getSecret('tiktok_client_secret')) || '');
    setBrandVoice((await api.settings.get('brandVoice')) || '');
    setMetaStatus(await api.oauth.meta.status());
    setTtStatus(await api.oauth.tiktok.status());
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    if (anthropicKey) await api.settings.setSecret('anthropic_api_key', anthropicKey);
    if (metaAppId) await api.settings.set('metaAppId', metaAppId);
    if (metaAppSecret) await api.settings.setSecret('meta_app_secret', metaAppSecret);
    if (tiktokKey) await api.settings.set('tiktokClientKey', tiktokKey);
    if (tiktokSecret) await api.settings.setSecret('tiktok_client_secret', tiktokSecret);
    if (brandVoice) await api.settings.set('brandVoice', brandVoice);
    setSaveMsg('Saved.');
    setTimeout(() => setSaveMsg(''), 2000);
    onChange?.();
  }

  async function connectMeta() {
    setConnecting('meta');
    try {
      await api.oauth.meta.start();
      await refresh();
      onChange?.();
    } catch (e: any) {
      alert('Meta OAuth: ' + e.message);
    } finally {
      setConnecting(null);
    }
  }

  async function connectTikTok() {
    setConnecting('tiktok');
    try {
      await api.oauth.tiktok.start();
      await refresh();
      onChange?.();
    } catch (e: any) {
      alert('TikTok OAuth: ' + e.message);
    } finally {
      setConnecting(null);
    }
  }

  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">API keys are stored in macOS Keychain.</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>Claude API</h2>
        <label>Anthropic API key</label>
        <input type="password" placeholder="sk-ant-..." value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Get one at <a href="#" onClick={(e) => { e.preventDefault(); api.app.openExternal('https://console.anthropic.com/settings/keys'); }}>console.anthropic.com</a>
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>Meta (Instagram + Facebook) <span className={`badge ${metaStatus.connected ? 'ok' : ''}`}>{metaStatus.connected ? 'connected' : 'not connected'}</span></h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Meta App ID</label>
            <input value={metaAppId} onChange={(e) => setMetaAppId(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Meta App Secret</label>
            <input type="password" value={metaAppSecret} onChange={(e) => setMetaAppSecret(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)' }}>
          Create an app at <a href="#" onClick={(e) => { e.preventDefault(); api.app.openExternal('https://developers.facebook.com/apps/'); }}>developers.facebook.com</a>.
          Add Instagram Graph API + Facebook Login. Set OAuth redirect to <code>http://localhost:53682/oauth/meta/callback</code>.
          The Instagram account <strong>eric.a.spencer</strong> must be switched to Creator or Business and linked to a Facebook Page.
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          {metaStatus.connected ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                IG: {metaStatus.igUserId || '—'} · Page: {metaStatus.fbPageId || '—'}
              </span>
              <div style={{ flex: 1 }} />
              <button className="danger" onClick={async () => { await api.oauth.meta.logout(); refresh(); }}>Disconnect</button>
            </>
          ) : (
            <button className="primary" onClick={connectMeta} disabled={connecting === 'meta' || !metaAppId || !metaAppSecret}>
              {connecting === 'meta' ? 'Waiting for browser…' : 'Connect Meta'}
            </button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>TikTok <span className={`badge ${ttStatus.connected ? 'ok' : ''}`}>{ttStatus.connected ? 'connected' : 'not connected'}</span></h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Client Key</label>
            <input value={tiktokKey} onChange={(e) => setTiktokKey(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Client Secret</label>
            <input type="password" value={tiktokSecret} onChange={(e) => setTiktokSecret(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)' }}>
          Create an app at <a href="#" onClick={(e) => { e.preventDefault(); api.app.openExternal('https://developers.tiktok.com/apps/'); }}>developers.tiktok.com</a>.
          Add the Content Posting API product. Redirect: <code>http://localhost:53683/oauth/tiktok/callback</code>.
          "Direct Post" needs app review approval — until then, leave "direct" unchecked on Publish (uploads to your TikTok inbox for one-tap publishing on the app).
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          {ttStatus.connected ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>open_id: {ttStatus.openId}</span>
              <div style={{ flex: 1 }} />
              <button className="danger" onClick={async () => { await api.oauth.tiktok.logout(); refresh(); }}>Disconnect</button>
            </>
          ) : (
            <button className="primary" onClick={connectTikTok} disabled={connecting === 'tiktok' || !tiktokKey || !tiktokSecret}>
              {connecting === 'tiktok' ? 'Waiting for browser…' : 'Connect TikTok'}
            </button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>Brand voice</h2>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
          This is the system prompt for script generation. Edit to tune the voice, format, and examples.
        </p>
        <textarea value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} style={{ minHeight: 240 }} />
      </div>

      <div className="row">
        <button className="primary" onClick={save}>Save settings</button>
        {saveMsg && <span style={{ color: 'var(--green)', fontSize: 12 }}>{saveMsg}</span>}
      </div>
    </>
  );
}
