import { ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { ffmpeg } from '../lib/ffmpeg.js';
import { settings, clipsDir, musicDir, reelsDir, workDir, type Clip, type MusicTrack, type Reel } from '../lib/store.js';

type Script = {
  hook: string;
  lines: string[];
  cta: string;
  // Optional pacing config; if absent we auto-time evenly across the clip
  perLineSeconds?: number;
};

function escDrawText(s: string): string {
  // ffmpeg drawtext requires escaping for : ' \ % and brackets
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,');
}

function pickFontFile(): string | null {
  const candidates = [
    '/System/Library/Fonts/Supplemental/Impact.ttf',
    '/System/Library/Fonts/HelveticaNeue.ttc',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial.ttf',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

export function registerComposeHandlers() {
  ipcMain.handle(
    'compose:render',
    async (e, opts: { clipIds: string[]; script: Script; musicId?: string; outputName?: string }) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      const jobId = uuid();
      const allClips = (settings as any).get('clips') as Clip[];
      const allMusic = (settings as any).get('music') as MusicTrack[];

      const clips = opts.clipIds.map((id) => allClips.find((c) => c.id === id)!).filter(Boolean);
      if (clips.length === 0) throw new Error('No clips selected');
      const music = opts.musicId ? allMusic.find((m) => m.id === opts.musicId) : null;

      // Step 1: normalize each clip to 1080x1920, no audio, then concat
      const work = path.join(workDir(), jobId);
      fs.mkdirSync(work, { recursive: true });

      const normalized: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        const out = path.join(work, `n${i}.mp4`);
        await new Promise<void>((resolve, reject) => {
          ffmpeg(clips[i].path)
            .videoFilters([
              // scale & crop to 1080x1920 (9:16), pad if needed
              'scale=1080:1920:force_original_aspect_ratio=increase',
              'crop=1080:1920',
              'fps=30',
            ])
            .noAudio()
            .outputOptions(['-c:v libx264', '-preset veryfast', '-crf 20', '-pix_fmt yuv420p'])
            .on('progress', (p) => {
              win?.webContents.send('compose:progress', {
                jobId,
                percent: Math.min(40, ((i + (p.percent || 0) / 100) / clips.length) * 40),
                stage: `normalize ${i + 1}/${clips.length}`,
              });
            })
            .on('end', () => resolve())
            .on('error', reject)
            .save(out);
        });
        normalized.push(out);
      }

      // Step 2: concat
      const concatList = path.join(work, 'concat.txt');
      fs.writeFileSync(
        concatList,
        normalized.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
      );
      const concatted = path.join(work, 'concat.mp4');
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(concatList)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-c copy'])
          .on('progress', (p) => {
            win?.webContents.send('compose:progress', { jobId, percent: 45, stage: 'concat' });
          })
          .on('end', () => resolve())
          .on('error', reject)
          .save(concatted);
      });

      // Determine timing for text overlays
      const totalLines = 1 + opts.script.lines.length + 1; // hook + lines + cta
      const probeDur = await new Promise<number>((resolve) =>
        ffmpeg.ffprobe(concatted, (_err, meta) => resolve(Number(meta?.format?.duration) || 25)),
      );
      const perLine = opts.script.perLineSeconds || Math.max(2, Math.min(4, probeDur / totalLines));
      const font = pickFontFile();
      const fontPart = font ? `:fontfile=${font}` : '';

      // Build drawtext chain: hook stays the whole time, lines appear sequentially, cta at the end
      const drawTexts: string[] = [];

      const baseStyle = `${fontPart}:fontcolor=white:fontsize=64:box=1:boxcolor=black@0.7:boxborderw=24:line_spacing=10`;
      drawTexts.push(
        `drawtext=text='${escDrawText(opts.script.hook.toUpperCase())}'${baseStyle}:x=(w-text_w)/2:y=160`,
      );

      let t = perLine; // hook is visible from t=0; first numbered line appears at t=perLine
      const lineStyle = `${fontPart}:fontcolor=white:fontsize=56:box=1:boxcolor=black@0.65:boxborderw=20`;
      for (let i = 0; i < opts.script.lines.length; i++) {
        const text = escDrawText(opts.script.lines[i]);
        // Each line shows from its start time until end of video
        drawTexts.push(
          `drawtext=text='${text}'${lineStyle}:x=(w-text_w)/2:y=${440 + i * 140}:enable='gte(t,${t.toFixed(2)})'`,
        );
        t += perLine;
      }

      const ctaStyle = `${fontPart}:fontcolor=#ff4d6d:fontsize=60:box=1:boxcolor=white@0.95:boxborderw=24`;
      drawTexts.push(
        `drawtext=text='${escDrawText(opts.script.cta)}'${ctaStyle}:x=(w-text_w)/2:y=h-260:enable='gte(t,${(probeDur - perLine).toFixed(2)})'`,
      );

      const vf = drawTexts.join(',');
      const outName = opts.outputName || `reel-${Date.now()}.mp4`;
      const outPath = path.join(reelsDir(), outName);

      // Step 3: burn text + (optional) music in one pass
      await new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(concatted).videoFilters(vf);
        if (music) {
          cmd.input(music.path).outputOptions([
            '-map 0:v:0',
            '-map 1:a:0',
            '-shortest',
            '-c:v libx264',
            '-preset veryfast',
            '-crf 20',
            '-pix_fmt yuv420p',
            '-c:a aac',
            '-b:a 192k',
          ]);
        } else {
          cmd.outputOptions(['-c:v libx264', '-preset veryfast', '-crf 20', '-pix_fmt yuv420p']);
        }
        cmd
          .on('progress', (p) => {
            const pct = 50 + Math.min(50, (p.percent || 0) / 2);
            win?.webContents.send('compose:progress', { jobId, percent: pct, stage: 'burn text + audio' });
          })
          .on('end', () => resolve())
          .on('error', reject)
          .save(outPath);
      });

      // Cleanup work dir
      fs.rmSync(work, { recursive: true, force: true });

      const reels = (settings as any).get('reels') as Reel[];
      const reel: Reel = {
        id: jobId,
        path: outPath,
        filename: outName,
        script: opts.script,
        createdAt: Date.now(),
        status: 'draft',
      };
      (settings as any).set('reels', [reel, ...reels]);

      win?.webContents.send('compose:progress', { jobId, percent: 100, stage: 'done' });
      return reel;
    },
  );
}
