import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { settings, clipsDir, musicDir, reelsDir, type Clip, type MusicTrack, type Reel } from '../lib/store.js';
import { probe } from '../lib/ffmpeg.js';

export function registerLibraryHandlers() {
  ipcMain.handle('library:list', () => {
    return (settings as any).get('clips') as Clip[];
  });

  ipcMain.handle('library:import', async (_e, paths: string[]) => {
    const existing = (settings as any).get('clips') as Clip[];
    const added: Clip[] = [];
    for (const src of paths) {
      const id = uuid();
      const ext = path.extname(src) || '.mp4';
      const dest = path.join(clipsDir(), `${id}${ext}`);
      fs.copyFileSync(src, dest);
      let meta: any = {};
      try { meta = await probe(dest); } catch {}
      const clip: Clip = {
        id,
        path: dest,
        filename: path.basename(src),
        durationSec: meta.durationSec,
        width: meta.width,
        height: meta.height,
        tags: [],
        importedAt: Date.now(),
      };
      added.push(clip);
    }
    (settings as any).set('clips', [...existing, ...added]);
    return added;
  });

  ipcMain.handle('library:remove', (_e, id: string) => {
    const clips = (settings as any).get('clips') as Clip[];
    const target = clips.find((c) => c.id === id);
    if (target && fs.existsSync(target.path)) fs.unlinkSync(target.path);
    (settings as any).set('clips', clips.filter((c) => c.id !== id));
    return true;
  });

  ipcMain.handle('library:tag', (_e, id: string, tags: string[]) => {
    const clips = (settings as any).get('clips') as Clip[];
    const next = clips.map((c) => (c.id === id ? { ...c, tags } : c));
    (settings as any).set('clips', next);
    return true;
  });

  ipcMain.handle('library:listMusic', () => {
    return (settings as any).get('music') as MusicTrack[];
  });

  ipcMain.handle('library:importMusic', async (_e, paths: string[]) => {
    const existing = (settings as any).get('music') as MusicTrack[];
    const added: MusicTrack[] = [];
    for (const src of paths) {
      const id = uuid();
      const ext = path.extname(src) || '.mp3';
      const dest = path.join(musicDir(), `${id}${ext}`);
      fs.copyFileSync(src, dest);
      let meta: any = {};
      try { meta = await probe(dest); } catch {}
      added.push({
        id,
        path: dest,
        filename: path.basename(src),
        durationSec: meta.durationSec,
        importedAt: Date.now(),
      });
    }
    (settings as any).set('music', [...existing, ...added]);
    return added;
  });

  ipcMain.handle('library:listReels', () => {
    return (settings as any).get('reels') as Reel[];
  });
}
