import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import ffmpeg from 'fluent-ffmpeg';

const ff = (ffmpegPath as unknown as string) || 'ffmpeg';
const fp = (ffprobeStatic as any).path || 'ffprobe';

ffmpeg.setFfmpegPath(ff);
ffmpeg.setFfprobePath(fp);

export { ffmpeg, ff as ffmpegBinary, fp as ffprobeBinary };

export function probe(filePath: string): Promise<{
  durationSec: number;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err);
      const vstream = meta.streams.find((s) => s.codec_type === 'video');
      resolve({
        durationSec: Number(meta.format.duration) || 0,
        width: vstream?.width || 0,
        height: vstream?.height || 0,
      });
    });
  });
}
