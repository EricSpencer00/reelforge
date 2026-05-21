import { ipcMain, BrowserWindow } from 'electron';
import { v4 as uuid } from 'uuid';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { createRequire } from 'node:module';

// node-pty is a native CJS module; load via createRequire so the ESM main bundle
// can still resolve it (and so a build failure on the native side doesn't crash us).
const require = createRequire(import.meta.url);
let pty: any = null;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn('[pty] node-pty unavailable, falling back to child_process:', (e as Error).message);
}

const sessions = new Map<string, { kill: () => void; write: (d: string) => void; resize: (c: number, r: number) => void }>();

function findClaudeBinary(): string | null {
  const candidates = [
    `${os.homedir()}/.claude/local/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    `${os.homedir()}/.npm-global/bin/claude`,
    `${os.homedir()}/.volta/bin/claude`,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function registerPtyHandlers() {
  ipcMain.handle('pty:spawn', async (e, opts: { cols: number; rows: number; cwd?: string; cmd?: string }) => {
    const id = uuid();
    const win = BrowserWindow.fromWebContents(e.sender);
    const cwd = opts.cwd || os.homedir();
    const shell = process.env.SHELL || '/bin/zsh';

    // If user wants to run claude directly, prefer that. Otherwise drop into a normal shell.
    const claudeBin = findClaudeBinary();
    let cmd = opts.cmd;
    if (!cmd) {
      cmd = claudeBin ? claudeBin : shell;
    }

    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };

    if (pty) {
      const proc = pty.spawn(cmd, [], {
        name: 'xterm-256color',
        cols: opts.cols || 80,
        rows: opts.rows || 24,
        cwd,
        env,
      });

      proc.onData((data: string) => {
        win?.webContents.send(`pty:data:${id}`, data);
      });
      proc.onExit(() => {
        win?.webContents.send(`pty:exit:${id}`);
        sessions.delete(id);
      });

      sessions.set(id, {
        kill: () => proc.kill(),
        write: (d) => proc.write(d),
        resize: (c, r) => proc.resize(c, r),
      });
    } else {
      // Fallback: plain child_process. No TTY, but works.
      const proc = nodeSpawn(cmd, [], { cwd, env, shell: true });
      proc.stdout.on('data', (d) => win?.webContents.send(`pty:data:${id}`, d.toString()));
      proc.stderr.on('data', (d) => win?.webContents.send(`pty:data:${id}`, d.toString()));
      proc.on('exit', () => {
        win?.webContents.send(`pty:exit:${id}`);
        sessions.delete(id);
      });
      sessions.set(id, {
        kill: () => proc.kill(),
        write: (d) => proc.stdin.write(d),
        resize: () => {},
      });
    }

    return id;
  });

  ipcMain.handle('pty:write', (_e, id: string, data: string) => {
    sessions.get(id)?.write(data);
  });

  ipcMain.handle('pty:resize', (_e, id: string, cols: number, rows: number) => {
    sessions.get(id)?.resize(cols, rows);
  });

  ipcMain.handle('pty:kill', (_e, id: string) => {
    sessions.get(id)?.kill();
    sessions.delete(id);
  });
}
