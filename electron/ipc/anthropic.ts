import { ipcMain } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import keytar from 'keytar';
import { settings } from '../lib/store.js';

const SERVICE = 'xyz.instxnt.reelforge';

async function getKey(): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE, 'anthropic_api_key');
  } catch {
    return null;
  }
}

export function registerAnthropicHandlers() {
  ipcMain.handle('anthropic:generateScript', async (_e, opts: { brief: string; brandVoice?: string }) => {
    const apiKey = await getKey();
    if (!apiKey) throw new Error('Anthropic API key not set. Add it in Settings.');
    const brandVoice = opts.brandVoice || ((settings as any).get('brandVoice') as string);
    const client = new Anthropic({ apiKey });

    const system = `You are a short-form video scriptwriter for instxnt.xyz.
Output STRICTLY valid JSON matching this schema:
{
  "hook": "string (8-12 words, all caps friendly)",
  "lines": ["3 to 6 short numbered absurd lines"],
  "cta": "one-line closer that lands the brand",
  "caption": "social media caption with hashtags",
  "perLineSeconds": 3
}
No prose. No code fences. Just the JSON object.

${brandVoice}`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: `Brief: ${opts.brief}\n\nReturn the JSON only.` }],
    });

    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    // Be lenient: strip code fences if the model emits them anyway
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      // Try to extract first {...} block
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
      throw new Error(`Could not parse Claude output as JSON:\n${cleaned}`);
    }
  });
}
