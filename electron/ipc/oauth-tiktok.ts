import { ipcMain, BrowserWindow, shell } from 'electron';
import http from 'node:http';
import crypto from 'node:crypto';
import keytar from 'keytar';
import { settings } from '../lib/store.js';

const SERVICE = 'xyz.instxnt.reelforge';
const REDIRECT_PORT = 53683;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/tiktok/callback`;

// video.upload = "Upload to Inbox" (no app review required for sandbox)
// video.publish = direct post (requires app review approval)
const SCOPES = 'user.info.basic,video.upload,video.publish';

async function getClientKey(): Promise<string | null> {
  return ((settings as any).get('tiktokClientKey') as string) || null;
}
async function getClientSecret(): Promise<string | null> {
  try { return await keytar.getPassword(SERVICE, 'tiktok_client_secret'); } catch { return null; }
}

export async function getTikTokToken(): Promise<string | null> {
  try { return await keytar.getPassword(SERVICE, 'tiktok_access_token'); } catch { return null; }
}

export function registerTikTokOAuthHandlers() {
  ipcMain.handle('oauth:tiktok:start', async (e) => {
    const clientKey = await getClientKey();
    const clientSecret = await getClientSecret();
    if (!clientKey || !clientSecret) {
      throw new Error('TikTok Client Key and Secret must be set in Settings before connecting.');
    }
    const win = BrowserWindow.fromWebContents(e.sender);
    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = crypto.randomBytes(48).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return new Promise<{ ok: boolean; error?: string; openId?: string }>((resolve) => {
      const server = http.createServer(async (req, res) => {
        if (!req.url?.startsWith('/oauth/tiktok/callback')) {
          res.writeHead(404).end();
          return;
        }
        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error_description') || url.searchParams.get('error');

        const close = (html: string) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html);
          setTimeout(() => server.close(), 500);
        };

        if (error) {
          close(`<h2>TikTok OAuth failed</h2><p>${error}</p>`);
          win?.focus();
          resolve({ ok: false, error });
          return;
        }
        if (!code || returnedState !== state) {
          close('<h2>OAuth state mismatch</h2>');
          resolve({ ok: false, error: 'state_mismatch' });
          return;
        }
        try {
          const body = new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
          });
          const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          });
          const json = (await tokenRes.json()) as any;
          if (!tokenRes.ok || !json.access_token) {
            throw new Error(JSON.stringify(json));
          }
          await keytar.setPassword(SERVICE, 'tiktok_access_token', json.access_token);
          if (json.refresh_token) {
            await keytar.setPassword(SERVICE, 'tiktok_refresh_token', json.refresh_token);
          }
          if (json.open_id) (settings as any).set('tiktokOpenId', json.open_id);
          if (json.expires_in) (settings as any).set('tiktokTokenExpiresAt', Date.now() + json.expires_in * 1000);

          close('<h2>TikTok connected ✓</h2><p>You can close this tab.</p>');
          win?.focus();
          resolve({ ok: true, openId: json.open_id });
        } catch (err: any) {
          close(`<h2>Token exchange failed</h2><pre>${err.message}</pre>`);
          resolve({ ok: false, error: err.message });
        }
      });

      server.listen(REDIRECT_PORT, () => {
        const authUrl =
          'https://www.tiktok.com/v2/auth/authorize/' +
          `?client_key=${clientKey}` +
          `&scope=${encodeURIComponent(SCOPES)}` +
          '&response_type=code' +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&state=${state}` +
          `&code_challenge=${codeChallenge}` +
          '&code_challenge_method=S256';
        shell.openExternal(authUrl);
      });
    });
  });

  ipcMain.handle('oauth:tiktok:status', async () => {
    const token = await getTikTokToken();
    return {
      connected: !!token,
      openId: (settings as any).get('tiktokOpenId'),
      expiresAt: (settings as any).get('tiktokTokenExpiresAt'),
    };
  });

  ipcMain.handle('oauth:tiktok:logout', async () => {
    try {
      await keytar.deletePassword(SERVICE, 'tiktok_access_token');
      await keytar.deletePassword(SERVICE, 'tiktok_refresh_token');
    } catch {}
    (settings as any).delete('tiktokOpenId');
    (settings as any).delete('tiktokTokenExpiresAt');
    return true;
  });
}
