import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import keytar from 'keytar';
import { settings, type Reel } from '../lib/store.js';

const SERVICE = 'xyz.instxnt.reelforge';

async function getPageToken(): Promise<string | null> {
  try { return await keytar.getPassword(SERVICE, 'meta_page_token'); } catch { return null; }
}

// Serve a video over a temporary localhost URL that Meta can fetch.
// (Reels API requires a public URL OR a multi-part chunked upload to
// rupload.facebook.com — the chunked upload is more reliable here.)
async function uploadVideoToMeta(igUserId: string, pageToken: string, videoPath: string, caption: string, isReel: boolean) {
  // Use the resumable upload protocol.
  // 1) Create a container with media_type=REELS and upload_type=resumable
  const fileSize = fs.statSync(videoPath).size;
  const filename = path.basename(videoPath);

  const containerUrl = `https://graph.facebook.com/v21.0/${igUserId}/media`;
  const params = new URLSearchParams({
    media_type: 'REELS',
    upload_type: 'resumable',
    caption,
    access_token: pageToken,
  });
  const containerRes = await fetch(containerUrl + '?' + params.toString(), { method: 'POST' });
  const containerJson = (await containerRes.json()) as any;
  if (!containerRes.ok || !containerJson.id) {
    throw new Error('Container creation failed: ' + JSON.stringify(containerJson));
  }
  const containerId = containerJson.id;
  const uploadUrl = containerJson.uri || `https://rupload.facebook.com/ig-api-upload/v21.0/${containerId}`;

  // 2) Upload bytes
  const fileBuf = fs.readFileSync(videoPath);
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageToken}`,
      offset: '0',
      file_size: String(fileSize),
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuf,
  });
  const upJson = (await upRes.json().catch(() => ({}))) as any;
  if (!upRes.ok) throw new Error('Video upload failed: ' + JSON.stringify(upJson));

  // 3) Poll status_code until FINISHED
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status&access_token=${pageToken}`,
    );
    const statusJson = (await statusRes.json()) as any;
    if (statusJson.status_code === 'FINISHED') break;
    if (statusJson.status_code === 'ERROR') throw new Error('Media processing error: ' + JSON.stringify(statusJson));
  }

  // 4) Publish
  const pubRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/media_publish?creation_id=${containerId}&access_token=${pageToken}`,
    { method: 'POST' },
  );
  const pubJson = (await pubRes.json()) as any;
  if (!pubRes.ok) throw new Error('Publish failed: ' + JSON.stringify(pubJson));
  return pubJson.id as string;
}

async function publishFbReel(pageId: string, pageToken: string, videoPath: string, caption: string) {
  // Facebook Reels: initialize -> upload -> finalize
  const initRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: pageToken }),
  });
  const initJson = (await initRes.json()) as any;
  if (!initRes.ok || !initJson.video_id) throw new Error('FB init failed: ' + JSON.stringify(initJson));
  const videoId = initJson.video_id;
  const uploadUrl = initJson.upload_url;

  const fileBuf = fs.readFileSync(videoPath);
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageToken}`,
      offset: '0',
      file_size: String(fileBuf.length),
    },
    body: fileBuf,
  });
  if (!upRes.ok) throw new Error('FB upload failed: ' + (await upRes.text()));

  const finRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'finish',
      video_id: videoId,
      description: caption,
      video_state: 'PUBLISHED',
      access_token: pageToken,
    }),
  });
  const finJson = (await finRes.json()) as any;
  if (!finRes.ok) throw new Error('FB finish failed: ' + JSON.stringify(finJson));
  return videoId as string;
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

export function registerMetaPublishHandlers() {
  ipcMain.handle('publish:instagram', async (_e, opts: { videoPath: string; caption: string }) => {
    const igUserId = (settings as any).get('igUserId') as string | undefined;
    const pageToken = await getPageToken();
    if (!igUserId || !pageToken) throw new Error('Instagram not connected. Connect in Settings.');
    const postId = await uploadVideoToMeta(igUserId, pageToken, opts.videoPath, opts.caption, true);
    markPublished(opts.videoPath, 'instagram', postId);
    return { ok: true, postId };
  });

  ipcMain.handle('publish:facebook', async (_e, opts: { videoPath: string; caption: string }) => {
    const pageId = (settings as any).get('fbPageId') as string | undefined;
    const pageToken = await getPageToken();
    if (!pageId || !pageToken) throw new Error('Facebook not connected. Connect in Settings.');
    const postId = await publishFbReel(pageId, pageToken, opts.videoPath, opts.caption);
    markPublished(opts.videoPath, 'facebook', postId);
    return { ok: true, postId };
  });
}
