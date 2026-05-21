import { ipcMain, BrowserWindow, shell } from 'electron';
import http from 'node:http';
import crypto from 'node:crypto';
import keytar from 'keytar';
import { settings } from '../lib/store.js';

const SERVICE = 'xyz.instxnt.reelforge';
const REDIRECT_PORT = 53682;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/meta/callback`;

// Required scopes for posting Reels to IG Business and FB Page
const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management',
].join(',');

async function getAppId(): Promise<string | null> {
  const fromSettings = (settings as any).get('metaAppId') as string | undefined;
  if (fromSettings) return fromSettings;
  return null;
}

async function getAppSecret(): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE, 'meta_app_secret');
  } catch {
    return null;
  }
}

async function saveAccessToken(token: string, expiresIn?: number) {
  await keytar.setPassword(SERVICE, 'meta_user_token', token);
  if (expiresIn) {
    (settings as any).set('metaTokenExpiresAt', Date.now() + expiresIn * 1000);
  }
}

export async function getMetaToken(): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE, 'meta_user_token');
  } catch {
    return null;
  }
}

async function exchangeForLongLivedToken(shortToken: string, appId: string, appSecret: string): Promise<{ access_token: string; expires_in?: number }> {
  const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as any;
}

async function discoverPageAndIgAccount(token: string): Promise<{ pageId?: string; pageToken?: string; igUserId?: string }> {
  // Get the user's pages
  const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`);
  const pages = (await pagesRes.json()) as any;
  if (!pages.data || pages.data.length === 0) return {};
  const page = pages.data[0]; // user can change which one in Settings later
  const pageToken = page.access_token;
  const pageId = page.id;

  // Get the IG Business account linked to that page
  const igRes = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${pageToken}`,
  );
  const ig = (await igRes.json()) as any;
  const igUserId = ig.instagram_business_account?.id;

  // Persist page token in keychain
  await keytar.setPassword(SERVICE, 'meta_page_token', pageToken);
  return { pageId, pageToken, igUserId };
}

export function registerMetaOAuthHandlers() {
  ipcMain.handle('oauth:meta:start', async (e) => {
    const appId = await getAppId();
    const appSecret = await getAppSecret();
    if (!appId || !appSecret) {
      throw new Error('Meta App ID and App Secret must be set in Settings before connecting.');
    }
    const win = BrowserWindow.fromWebContents(e.sender);
    const state = crypto.randomBytes(16).toString('hex');

    return new Promise<{ ok: boolean; igUserId?: string; pageId?: string; error?: string }>((resolve) => {
      const server = http.createServer(async (req, res) => {
        if (!req.url?.startsWith('/oauth/meta/callback')) {
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
          close(`<h2>Meta OAuth failed</h2><p>${error}</p><p>You can close this tab.</p>`);
          win?.focus();
          resolve({ ok: false, error });
          return;
        }
        if (!code || returnedState !== state) {
          close('<h2>OAuth state mismatch</h2><p>You can close this tab.</p>');
          resolve({ ok: false, error: 'state_mismatch' });
          return;
        }
        try {
          // Exchange code for short-lived token
          const tokenRes = await fetch(
            `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${appSecret}&code=${code}`,
          );
          const tokenJson = (await tokenRes.json()) as any;
          if (!tokenRes.ok || !tokenJson.access_token) {
            throw new Error(JSON.stringify(tokenJson));
          }
          // Exchange for long-lived
          const long = await exchangeForLongLivedToken(tokenJson.access_token, appId, appSecret);
          await saveAccessToken(long.access_token, long.expires_in);

          const { pageId, igUserId } = await discoverPageAndIgAccount(long.access_token);
          if (pageId) (settings as any).set('fbPageId', pageId);
          if (igUserId) (settings as any).set('igUserId', igUserId);

          close(`<h2>Meta connected ✓</h2><p>You can close this tab and return to ReelForge.</p>`);
          win?.focus();
          resolve({ ok: true, igUserId, pageId });
        } catch (err: any) {
          close(`<h2>Token exchange failed</h2><pre>${err.message}</pre>`);
          resolve({ ok: false, error: err.message });
        }
      });

      server.listen(REDIRECT_PORT, () => {
        const authUrl =
          `https://www.facebook.com/v21.0/dialog/oauth?` +
          `client_id=${appId}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&scope=${encodeURIComponent(SCOPES)}` +
          `&state=${state}` +
          `&response_type=code`;
        shell.openExternal(authUrl);
      });
    });
  });

  ipcMain.handle('oauth:meta:status', async () => {
    const token = await getMetaToken();
    return {
      connected: !!token,
      igUserId: (settings as any).get('igUserId'),
      fbPageId: (settings as any).get('fbPageId'),
      expiresAt: (settings as any).get('metaTokenExpiresAt'),
    };
  });

  ipcMain.handle('oauth:meta:logout', async () => {
    try {
      await keytar.deletePassword(SERVICE, 'meta_user_token');
      await keytar.deletePassword(SERVICE, 'meta_page_token');
    } catch {}
    (settings as any).delete('igUserId');
    (settings as any).delete('fbPageId');
    (settings as any).delete('metaTokenExpiresAt');
    return true;
  });
}
