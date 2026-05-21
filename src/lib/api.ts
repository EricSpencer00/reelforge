import type { Api } from '../../electron/preload';

declare global {
  interface Window {
    api: Api;
  }
}

export const api = (typeof window !== 'undefined' ? window.api : ({} as Api)) as Api;

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

export type Script = {
  hook: string;
  lines: string[];
  cta: string;
  caption?: string;
  perLineSeconds?: number;
};

export function fileUrl(absPath: string): string {
  return `reelforge://${encodeURI(absPath)}`;
}
