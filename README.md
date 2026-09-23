# Reclaim

**Get back to your life.** A private, offline-first recovery journal (PWA) built for iPhone, following Apple’s Human Interface Guidelines (iOS 26 Liquid Glass). See [docs/PLAN.md](docs/PLAN.md) for the product plan and roadmap.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build (with service worker)
npm run preview    # serve the production build
```

## Put it on your iPhone

The service worker (offline mode) and reliable storage need HTTPS, so deploy it:

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com), **Add New → Project**, import the repo. Vercel detects Vite; no settings needed.
3. Open the Vercel URL in **Safari** on the iPhone → **Share → Add to Home Screen**.
4. Open it from the Home Screen icon. Your data lives on the phone; back it up from **Settings → Backup** (the share sheet offers Files and Google Drive).

## Google Drive backup (optional)

Encrypted backup, sync between devices, and medical records in your Drive. It needs a free Google client ID;
follow [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md), then put it in `.env.local`:

```
VITE_GOOGLE_CLIENT_ID=….apps.googleusercontent.com
```

Without it, the app works fully offline and Settings shows Google Drive as "Not set up".

## AI (optional)

Notes → entries, document summaries, weekly summary, Ask, and the clinician report's AI section. It runs through
`/api/ai` (a Vercel function; `npm run dev` serves it locally). Add to `.env.local`, **without** a `VITE_` prefix:

```
GEMINI_API_KEY=AIza…
AI_ALLOWED_EMAILS=you@gmail.com
```

Details and how it's protected: [docs/AI_SETUP.md](docs/AI_SETUP.md).

## Try it with sample data

Easiest: run `npm run dev`, open **Settings → Developer → Load Demo Data** (dev builds only). It adds ~75 days
of realistic recovery data; **Delete All Data** at the bottom of Settings starts fresh again.

Or as a file, e.g. to try it on the phone:

```bash
npm run demo-data   # writes Reclaim-demo.json
```

Then import it in **Settings → Restore** (on the phone, save the file to Files first).

## Tests

End-to-end tests drive the **production build** with Playwright as an iPhone 13, in two engines:
WebKit (Safari's engine) and Chromium.

```bash
npx playwright install webkit chromium   # once
npm run test:e2e        # full suite, both engines
npm run test:e2e:ui     # interactive runner
npm run test:report     # HTML report, incl. a light/dark screenshot tour of every screen
npm run typecheck       # app + tests
```

The suite seeds a deterministic, realistic dataset (`e2e/fixtures/demo-data.ts`) through the real
Restore flow, then checks the numbers on screen against values computed independently from that data.

Known limits of Playwright's **Windows** WebKit port (not Safari): it crashes while snapshotting View
Transitions, and its IndexedDB is ~100× slower. So the WebKit project runs with Reduce Motion and long
timeouts, and the offline test runs on Chromium only. Navigation motion is verified on Chromium.

## Project layout

```
api/           Vercel function entry (/api/ai)
server/ai/     AI handler, prompts, Gemini provider
shared/        AI contract shared by app and server
src/
  db/          Dexie schema, save/soft-delete helpers, live-query hooks, backup/restore
  components/  Layout + tab bar, Quick Log sheet, charts, motion links, shared iOS-style UI
  features/    today, rehab, timeline, injuries, documents, log (symptom/measurement/note), settings
  lib/         crypto (E2E encryption), google (sign-in), drive (API), sync, rehab logic, exercise library,
               dates, stats, transitions, platform, haptics, toast
e2e/           Playwright specs, helpers, fake Google, demo-data generator
```

Regenerate icons from `public/icon.svg` with `npm run icons`.
