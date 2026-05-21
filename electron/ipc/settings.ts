import { ipcMain, safeStorage } from 'electron';
import { settings } from '../lib/store.js';
import keytar from 'keytar';

const SERVICE = 'xyz.instxnt.reelforge';

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', (_e, key: string) => {
    return (settings as any).get(key);
  });

  ipcMain.handle('settings:set', (_e, key: string, value: any) => {
    (settings as any).set(key, value);
    return true;
  });

  ipcMain.handle('settings:getSecret', async (_e, key: string) => {
    try {
      return await keytar.getPassword(SERVICE, key);
    } catch {
      // Fall back to encrypted store if keychain is unavailable
      const enc = (settings as any).get(`__sec:${key}`);
      if (!enc) return null;
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(enc, 'base64'));
      }
      return enc;
    }
  });

  ipcMain.handle('settings:setSecret', async (_e, key: string, value: string) => {
    try {
      await keytar.setPassword(SERVICE, key, value);
      return true;
    } catch {
      if (safeStorage.isEncryptionAvailable()) {
        const enc = safeStorage.encryptString(value).toString('base64');
        (settings as any).set(`__sec:${key}`, enc);
      } else {
        (settings as any).set(`__sec:${key}`, value);
      }
      return true;
    }
  });

  ipcMain.handle('settings:deleteSecret', async (_e, key: string) => {
    try {
      await keytar.deletePassword(SERVICE, key);
    } catch {
      (settings as any).delete(`__sec:${key}`);
    }
    return true;
  });
}
