import { useEffect, useRef } from 'react';
import { Terminal as Xterm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../lib/api';

export function Terminal({ cwd, onSessionId }: { cwd?: string; onSessionId?: (id: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Xterm | null>(null);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;
    let resizeObs: ResizeObserver | null = null;
    let disposed = false;

    const term = new Xterm({
      cursorBlink: true,
      fontFamily: '"SF Mono", Menlo, monospace',
      fontSize: 12,
      theme: {
        background: '#000000',
        foreground: '#e7e7ef',
        cursor: '#ff4d6d',
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;

    (async () => {
      const id = await api.pty.spawn({ cols: term.cols, rows: term.rows, cwd });
      if (disposed) { api.pty.kill(id); return; }
      idRef.current = id;
      onSessionId?.(id);
      unsubData = api.pty.onData(id, (data) => term.write(data));
      unsubExit = api.pty.onExit(id, () => term.writeln('\r\n[process exited]'));
      term.onData((data) => api.pty.write(id, data));
      term.onResize(({ cols, rows }) => api.pty.resize(id, cols, rows));
    })();

    resizeObs = new ResizeObserver(() => { try { fit.fit(); } catch {} });
    resizeObs.observe(hostRef.current);

    return () => {
      disposed = true;
      unsubData?.();
      unsubExit?.();
      resizeObs?.disconnect();
      if (idRef.current) api.pty.kill(idRef.current);
      term.dispose();
    };
  }, []);

  return <div ref={hostRef} className="terminal-host xterm" />;
}
