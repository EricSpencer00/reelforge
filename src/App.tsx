import { useEffect, useState } from 'react';
import { Library } from './components/Library';
import { Compose } from './components/Compose';
import { Review } from './components/Review';
import { Publish } from './components/Publish';
import { Settings } from './components/Settings';
import { api } from './lib/api';

type Tab = 'library' | 'compose' | 'review' | 'publish' | 'settings';

export function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [metaStatus, setMetaStatus] = useState<{ connected: boolean }>({ connected: false });
  const [tiktokStatus, setTiktokStatus] = useState<{ connected: boolean }>({ connected: false });

  async function refreshStatus() {
    try {
      setMetaStatus(await api.oauth.meta.status());
      setTiktokStatus(await api.oauth.tiktok.status());
    } catch {}
  }

  useEffect(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">
          <span className="dot" />
          ReelForge
        </div>
        <nav>
          <NavButton active={tab === 'library'} onClick={() => setTab('library')}>📁 Library</NavButton>
          <NavButton active={tab === 'compose'} onClick={() => setTab('compose')}>✍️ Compose</NavButton>
          <NavButton active={tab === 'review'} onClick={() => setTab('review')}>🎬 Review</NavButton>
          <NavButton active={tab === 'publish'} onClick={() => setTab('publish')}>🚀 Publish</NavButton>
        </nav>
        <div className="spacer" />
        <NavButton active={tab === 'settings'} onClick={() => setTab('settings')}>⚙️ Settings</NavButton>
        <div className="status">
          <div>Meta: <span className={`badge ${metaStatus.connected ? 'ok' : 'warn'}`}>{metaStatus.connected ? 'connected' : 'not connected'}</span></div>
          <div style={{ marginTop: 4 }}>TikTok: <span className={`badge ${tiktokStatus.connected ? 'ok' : 'warn'}`}>{tiktokStatus.connected ? 'connected' : 'not connected'}</span></div>
        </div>
      </aside>

      <main className="main">
        {tab === 'library' && <Library />}
        {tab === 'compose' && <Compose onComposed={() => setTab('review')} />}
        {tab === 'review' && <Review onPublishRequest={() => setTab('publish')} />}
        {tab === 'publish' && <Publish />}
        {tab === 'settings' && <Settings onChange={refreshStatus} />}
      </main>
    </div>
  );
}

function NavButton({ children, active, onClick }: any) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      {children}
    </button>
  );
}
