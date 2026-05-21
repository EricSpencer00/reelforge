import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import Store from 'electron-store';

export const dataRoot = () => path.join(app.getPath('userData'), 'data');
export const clipsDir = () => path.join(dataRoot(), 'clips');
export const musicDir = () => path.join(dataRoot(), 'music');
export const reelsDir = () => path.join(dataRoot(), 'reels');
export const workDir = () => path.join(dataRoot(), 'work');

export function ensureDataDirs() {
  [dataRoot(), clipsDir(), musicDir(), reelsDir(), workDir()].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

export type Clip = {
  id: string;
  path: string;
  filename: string;
  durationSec?: number;
  width?: number;
  height?: number;
  tags: string[];
  importedAt: number;
};

export type MusicTrack = {
  id: string;
  path: string;
  filename: string;
  bpm?: number;
  durationSec?: number;
  importedAt: number;
};

export type Reel = {
  id: string;
  path: string;
  filename: string;
  script: any;
  createdAt: number;
  status: 'draft' | 'approved' | 'published';
  publishedTo?: { platform: string; postId?: string; at: number }[];
};

type Schema = {
  clips: Clip[];
  music: MusicTrack[];
  reels: Reel[];
  brandVoice: string;
  metaAppId?: string;
  tiktokClientKey?: string;
  igUserId?: string;
  fbPageId?: string;
};

const store = new Store<Schema>({
  name: 'reelforge',
  defaults: {
    clips: [],
    music: [],
    reels: [],
    brandVoice: defaultBrandVoice(),
  },
});

export const settings = store;

function defaultBrandVoice() {
  return `BRAND: instxnt.xyz — a Shopify clone that charges per-sale commissions instead of flat monthly fees.
TONE: deadpan dev humor, self-aware, slightly cynical. Numbered-list comedy bits, escalating absurdity.
AUDIENCE: indie ecom founders, side-hustlers, devs who think Shopify pricing is a scam.
FORMAT: looping b-roll + static text overlay + fast music. 20–30 seconds.
SCRIPT STRUCTURE:
  - hook: one short punchy line (8-12 words)
  - lines: 3-6 numbered absurd dev/ecom tasks, escalating
  - cta: closing zinger that lands the brand
EXAMPLES:
  - hook: "running a shopify store in 2026:"
    lines: [
      "1. pay $39/mo to exist",
      "2. pay $30 per app to do anything",
      "3. pay 2% per sale because reasons",
      "4. monthly bill: $2400 for 3 customers"
    ]
    cta: "or pay $0 monthly + cents-on-the-dollar at instxnt.xyz"`;
}
