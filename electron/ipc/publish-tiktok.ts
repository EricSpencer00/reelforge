import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import keytar from 'keytar';
import { settings, type Reel } from '../lib/store.js';

const SERVICE = 'xyz.instxnt.reelforge';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

async function getToken(): Promise<string | null> {
  try { return await keytar.getPassword(SERVICE, 'tiktok_access_token'); } catch { return null; }
}

async function initUpload(token: string, fileSize: number, chunkSize: number, totalChunks: number, directPost: boolean, caption: string): Promise<{ uploadUrl: string; publishId: string }> {
  const endpoint = directPost
    ? 'https://open.tiktokapis.com/v2/post/publish/video/init/'
    : 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/';

  const body: any = {
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: fileSize,
      chunk_size: chunkSize,
      total_chunk_count: totalChunks,
    },
  };
  if (directPost) {
    body.post_info = {
      title: caption.slice(0, 2200),
      privacy_level: 'SELF_ONLY', // safest default; user can override later in Settings
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  if (!res.ok || !json.data?.upload_url) {
    throw new Error('TikTok init failed: ' + JSON.stringify(json));
  }
  return { uploadUrl: json.data.upload_url, publishId: json.data.publish_id };
}

async function uploadChunks(uploadUrl: string, videoPath: string, fileSize: number) {
  const fd = fs.openSync(videoPath, 'r');
  try {
    let offset = 0;
    while (offset < fileSize) {
      const chunkEnd = Math.min(offset + CHUNK_SIZE, fileSize) - 1;
      const len = chunkEnd - offset + 1;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${offset}-${chunkEnd}/${fileSize}`,
          'Content-Type': 'video/mp4',
          'Content-Length': String(len),
        },
        body: buf,
      });
      if (!res.ok && res.status !== 206 && res.status !== 201) {
        throw new Error(`Chunk upload failed at ${offset}: ${res.status} ${await res.text()}`);
      }
      offset = chunkEnd + 1;
    }
  } finally {
    fs.closeSync(fd);
  }
}

function markPublished(reelPath: string, platform: string, postId?: string) {
  const reels = (settings as any).get('reels') as Reel[];
  const next = reels.map((r) =>
    r.path === reelPath
      ? {
          ...r,
          status: 'published' as const,
          publishedTo: [...(r.publishedTo || []), { platform, postId, at: Date.now() }],
        }
      : r,
  );
  (settings as any).set('reels', next);
}

export function registerTikTokPublishHandlers() {
  ipcMain.handle('publish:tiktok', async (_e, opts: { videoPath: string; caption: string; directPost: boolean }) => {
    const token = await getToken();
    if (!token) throw new Error('TikTok not connected. Connect in Settings.');
    const stat = fs.statSync(opts.videoPath);
    const fileSize = stat.size;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const chunkSize = totalChunks === 1 ? fileSize : CHUNK_SIZE;

    const { uploadUrl, publishId } = await initUpload(token, fileSize, chunkSize, totalChunks, opts.directPost, opts.caption);
    await uploadChunks(uploadUrl, opts.videoPath, fileSize);

    markPublished(opts.videoPath, opts.directPost ? 'tiktok' : 'tiktok-inbox', publishId);
    return {
      ok: true,
      publishId,
      mode: opts.directPost ? 'direct' : 'inbox',
      note: opts.directPost
        ? 'Posted directly to TikTok profile.'
        : 'Sent to your TikTok inbox — open the TikTok app to finish posting.',
    };
  });
}
