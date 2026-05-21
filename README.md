# ReelForge

A desktop app that turns one comedic prompt into a 9:16 reel ready to publish on Instagram, Facebook, and TikTok. Built for [instxnt.xyz](https://instxnt.xyz).

The pipeline:

```
your B-roll  ─┐
              ├──▶  Claude writes script ──▶ ffmpeg burns text + music ──▶ you approve ──▶ IG + FB + TikTok
brand voice  ─┘
```

## Credits

Originally built by [Abhishek Khedekar](https://github.com/abhikhedekar4241) ([@abhiquack](https://twitter.com/abhiquack), [abhishekkhedekar.com](https://abhishekkhedekar.com/)) — credit for the Electron + Claude + ffmpeg + Meta/TikTok-OAuth scaffolding goes to him. This fork extends it for [instxnt.xyz](https://instxnt.xyz); see the [Roadmap](#roadmap) for what I'm trying to layer on top.

## First-run setup (do these once)

### 1. Install and run

```bash
cd ~/GitHub/reelforge
npm install
npm run dev
```

Native modules (`node-pty`, `keytar`) compile against Electron's Node. If you hit a rebuild error, run `npm run postinstall` then `npm run dev` again.

### 2. Anthropic API key

`console.anthropic.com → Settings → API Keys`. Paste into **Settings → Claude API**.

### 3. Switch your Instagram to Creator or Business

Your IG handle must be a Creator or Business account. Personal accounts cannot use the Graph API.

`Instagram app → Settings → Account → Switch to Creator account` (free, takes 10 seconds, no follower loss). Then **link it to a Facebook Page** — you can create a placeholder page if you don't already have one.

### 4. Create a Meta developer app

`developers.facebook.com/apps → Create App → Business → Continue`. Add these products:
- Instagram Graph API
- Facebook Login

In **Facebook Login → Settings**, add valid OAuth redirect URI:

```
http://localhost:53682/oauth/meta/callback
```

Copy the **App ID** and **App Secret** into **Settings → Meta** in ReelForge. Click **Connect Meta** — your browser will pop up a Facebook auth dialog, you approve, and ReelForge auto-discovers your linked IG account and Page.

### 5. Create a TikTok developer app

`developers.tiktok.com/apps → Manage apps → Connect an app`. Add the **Content Posting API** product. Add redirect URI:

```
http://localhost:53683/oauth/tiktok/callback
```

Copy the **Client Key** and **Client Secret** into **Settings → TikTok**. Click **Connect TikTok**.

> **Direct post vs Inbox.** TikTok requires app review approval to post directly to a user's profile. Until you're approved, leave the "direct" toggle off on the Publish tab — your video uploads to your TikTok Drafts inbox and you tap publish in the TikTok app. Apply for review in parallel; this takes 2–6 weeks.

## Daily flow

1. **Library** — Shoot 10–30 short B-roll clips on your phone (you typing, walking to desk, coffee, monitor close-ups, server racks, your dog, whatever). Drop them in once. Also drop in a few royalty-free tracks from [mixkit.co](https://mixkit.co/free-stock-music/) or [pixabay.com/music](https://pixabay.com/music/).

2. **Compose** — Either:
   - **Quick generate**: type a brief ("shopify pricing is insane, 4 lines"), hit Generate, get a JSON script.
   - **Claude Code terminal**: open the embedded terminal, ask Claude anything ("write a reel script about the time my client got a $30k shopify bill"), paste the JSON it spits out into the script field.

   Pick 1–3 clips, pick a track, hit **Render**.

3. **Review** — Watch. If it's funny, **Send to Publish**. If not, jump back to Compose and regenerate.

4. **Publish** — Confirm caption, check the boxes for IG/FB/TikTok, hit publish. Done.

## Where things live

- App data: `~/Library/Application Support/reelforge/data/`
  - `clips/` — your B-roll
  - `music/` — your tracks
  - `reels/` — rendered output, ready to publish
- Secrets: macOS Keychain (`xyz.instxnt.reelforge`)

## Cost estimate

- Anthropic API: ~$0.05–0.30 per reel (Sonnet, with brand voice cached)
- Hosting: $0 (runs on your Mac)
- Music/footage: $0 (royalty-free libs)
- IG/FB/TikTok APIs: $0

**~$30/month for 3 reels/day across 3 platforms.** Mostly Claude.

## Known limits

- **TikTok direct post requires app review.** Inbox mode works today with sandbox credentials.
- **Meta token expires every ~60 days.** Reconnect from Settings when it does.
- **Rate limits.** IG: 100 API posts / 24h. Plenty.
- **No scheduling yet.** Render and publish immediately. Add a cron wrapper later.

## Roadmap

A few things I want to add. None of these are built yet — listing them here so future-me doesn't forget.

- **Larp B-Roll engine.** Right now you have to film your own b-roll. The plan: each script beat gets a per-line `brollPrompt` from Claude, sent to Kling 3.0 (~$0.50/clip) for staged founder-life shots (hands typing, packing tape, monitor close-ups, Stripe notifications popping). Falls back to a curated Pixabay/Mixkit library when the prompt matches a cached shot. Adds maybe $2–3/reel in video gen cost.
- **Long-form → clips.** Point at a YouTube URL or podcast file, run local Whisper for word-timestamps, have Claude pick 5–10 moment windows with hook + payoff, render each as a 9:16 with auto-captions burned in. This is the half of "auto clipper" that the current app doesn't do.
- **Multi-account fanout.** Token store keyed by IG handle instead of one creds blob. One render → N accounts (founder, brand, niche meme handles) with per-account caption variants from Claude.
- **Scheduling.** Render queue + post queue + a launchd plist so the Mac mini posts on a schedule even when I'm asleep. Currently render-and-publish-immediately, which is annoying.
- **Brand voice memory.** Replace the static `defaultBrandVoice()` block in `electron/lib/store.ts` with an append-only `voice.jsonl` of approved scripts. Few-shot from the corpus on every call, prompt-cache the lot. Should improve with use.
- **Telemetry.** Nightly cron pulls IG Graph API `insights` per posted reel, writes to `metrics.sqlite`. Eventually a "what's working" tab grouped by hook pattern + audio + time-of-day.

If you want to take a swing at any of these, PRs welcome.

## Architecture quick map

- `electron/main.ts` — bootstraps the BrowserWindow, registers IPC handlers, exposes a `reelforge://` protocol so the renderer can play local files
- `electron/ipc/pty.ts` — spawns `claude` in a pseudo-terminal via `node-pty`; falls back to plain child_process if the native module fails
- `electron/ipc/compose.ts` — ffmpeg pipeline: normalize each clip to 1080×1920, concat, burn text overlays via drawtext, mux music
- `electron/ipc/oauth-meta.ts` / `oauth-tiktok.ts` — spins up a localhost HTTP server, opens the OAuth URL in the user's browser, exchanges the code for tokens, stores in Keychain
- `electron/ipc/publish-*.ts` — chunked uploads to IG Reels / FB Reels / TikTok
- `src/components/*` — React UI for each tab
