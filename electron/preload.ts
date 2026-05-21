import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Settings & keychain
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    getSecret: (key: string) => ipcRenderer.invoke('settings:getSecret', key),
    setSecret: (key: string, value: string) => ipcRenderer.invoke('settings:setSecret', key, value),
    deleteSecret: (key: string) => ipcRenderer.invoke('settings:deleteSecret', key),
  },

  // Library
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    import: (paths: string[]) => ipcRenderer.invoke('library:import', paths),
    remove: (id: string) => ipcRenderer.invoke('library:remove', id),
    tag: (id: string, tags: string[]) => ipcRenderer.invoke('library:tag', id, tags),
    listMusic: () => ipcRenderer.invoke('library:listMusic'),
    importMusic: (paths: string[]) => ipcRenderer.invoke('library:importMusic', paths),
    listReels: () => ipcRenderer.invoke('library:listReels'),
  },

  // Embedded Claude Code terminal
  pty: {
    spawn: (opts: { cols: number; rows: number; cwd?: string; cmd?: string }) =>
      ipcRenderer.invoke('pty:spawn', opts),
    write: (id: string, data: string) => ipcRenderer.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('pty:kill', id),
    onData: (id: string, cb: (data: string) => void) => {
      const channel = `pty:data:${id}`;
      const handler = (_: any, data: string) => cb(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onExit: (id: string, cb: () => void) => {
      const channel = `pty:exit:${id}`;
      const handler = () => cb();
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
  },

  // Anthropic API (alternative to terminal for one-shot script gen)
  anthropic: {
    generateScript: (opts: { brief: string; brandVoice?: string }) =>
      ipcRenderer.invoke('anthropic:generateScript', opts),
  },

  // Video composition
  compose: {
    render: (opts: {
      clipIds: string[];
      script: any;
      musicId?: string;
      outputName?: string;
    }) => ipcRenderer.invoke('compose:render', opts),
    onProgress: (cb: (p: { jobId: string; percent: number; stage: string }) => void) => {
      const handler = (_: any, p: any) => cb(p);
      ipcRenderer.on('compose:progress', handler);
      return () => ipcRenderer.removeListener('compose:progress', handler);
    },
  },

  // OAuth flows
  oauth: {
    meta: {
      start: () => ipcRenderer.invoke('oauth:meta:start'),
      status: () => ipcRenderer.invoke('oauth:meta:status'),
      logout: () => ipcRenderer.invoke('oauth:meta:logout'),
    },
    tiktok: {
      start: () => ipcRenderer.invoke('oauth:tiktok:start'),
      status: () => ipcRenderer.invoke('oauth:tiktok:status'),
      logout: () => ipcRenderer.invoke('oauth:tiktok:logout'),
    },
  },

  // Publishing
  publish: {
    instagram: (opts: { videoPath: string; caption: string }) =>
      ipcRenderer.invoke('publish:instagram', opts),
    facebook: (opts: { videoPath: string; caption: string }) =>
      ipcRenderer.invoke('publish:facebook', opts),
    tiktok: (opts: { videoPath: string; caption: string; directPost: boolean }) =>
      ipcRenderer.invoke('publish:tiktok', opts),
  },

  // Generic
  app: {
    pickFiles: (opts: { filters?: any[]; multiple?: boolean }) =>
      ipcRenderer.invoke('app:pick-files', opts),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    reveal: (p: string) => ipcRenderer.invoke('app:reveal', p),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
