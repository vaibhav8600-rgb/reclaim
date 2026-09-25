# Reclaim

**Get back to your life.** A private, offline-first health and recovery app (PWA) for iPhone, following Apple’s Human Interface Guidelines (iOS 26 Liquid Glass). Your data lives on the phone; AI helps on top of it and never replaces it. See [docs/PLAN.md](docs/PLAN.md) for the plan and roadmap.

## What it does

- **Today:** rings for calories, protein, water, steps and sleep against your goals, one-tap water, weight, pain, rehab, and your recovery plan. A one-minute first-run setup suggests starting goals.
- **Nutrition:** meals with calories, protein, carbs, fat and fiber; a built-in list of ~110 common Indian and everyday foods with familiar portions; My Foods from nutrition labels; saved meals and recipes; AI estimates from a photo or description (checked before saving); AI meal ideas that fit what’s left of the day; a calorie goal worked out from your profile.
- **Daily basics:** sleep, steps, weight with a chart, goal and BMI; everything in one Goals page. Steps, weight and sleep can come from **Apple Health** through an iPhone Shortcut.
- **Recovery:** injuries, two-tap pain logs, symptoms, measurements, notes (AI turns a note into entries you review), a rehab plan with sessions, progress and a weekly check, and looping demonstrations of every library exercise.
- **Medical records:** add many reports at once; AI reads each into lab results, medicines, diagnoses and scan findings (quoting the page) for you to review; a Health Profile with lab history and an overall summary; conditions from records offered as injuries to track.
- **Recovery plan:** an AI draft that chooses only from a checked exercise library (each tied to a published clinical guideline), with doses kept in range and protein/water targets from fixed formulas. With several injuries, each exercise says how to adjust it for the others (kneeling on a sore knee, weight through a sore elbow), and the AI prefers exercises that don't clash.
- **Recovering safely:** the morning after a rehab session, Today asks whether the pain has settled (the pain-monitoring model), and the weekly check eases off when it hasn't. A flare-up mode gives a few gentler days (half the usual sets, what helps, when to get checked). Back and neck symptoms can say how far down the leg or arm they reach, and the injury page shows whether that's moving back towards the spine or spreading.
- **Weekly check-in:** a minute on how pain affects everyday life — the PEG scale, how long sitting and walking are comfortable, nights woken, and your own hardest activities rated 0–10 (Patient-Specific Functional Scale). "How You're Doing" shows first vs latest, and the doctor report includes it. The weight page shows what the weight you've lost takes off your knees with every step, and the steps page suggests a gentle target for the week.
- **Warning signs:** a 30-second check for the few signs that need a doctor now or soon (from the back and neck pain guidelines, plus joint emergencies), weekly while a back or neck injury is open and again after numbness, tingling or weakness is logged. A ticked sign is saved to the timeline.
- **Insights:** a weekly summary, Ask about your own data, and a printable clinician report.
- **Private by design:** everything on the phone; optional end-to-end encrypted Google Drive sync; AI only with your consent, only what a feature needs, never your name.

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
4. Open it from the Home Screen icon. Your data lives on the phone; back it up from **Settings → Backup** (the share sheet offers Files and Google Drive), or connect Google Drive for encrypted sync.

## Apple Health (optional)

A web app can’t read Apple Health directly, so a two-action iPhone Shortcut (Find Health Samples: Steps, today,
grouped by day → Copy to Clipboard) copies today’s steps. **Settings → Apple Health** shows how to build it (about
2 minutes, once). Each day: Today → Steps → **Get from Health** → come back → **Paste** → Save. (Copy and paste, not
a link: a Shortcut can only open Safari, which keeps separate storage from the Home Screen app.) The Settings page
also imports a longer line format with several days, weight and sleep (see `src/lib/healthImport.ts`).

Illustrated step-by-step guide: [Apple Health setup guide](https://claude.ai/artifact/TeLGDUGFJszL5z7mSXPJLy)
(private: only the owner, or people it's shared with, can open it).

## Google Drive backup (optional)

Encrypted backup, sync between devices, and medical records in your Drive. It needs a free Google client ID;
follow [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md), then put it in `.env.local`:

```
VITE_GOOGLE_CLIENT_ID=….apps.googleusercontent.com
```

Without it, the app works fully offline and Settings shows Google Drive as "Not set up".

## AI (optional)

Notes → entries, reading medical records into facts, the health overview, the recovery plan, meal estimates and
meal ideas, the weekly summary, Ask, and the clinician report's AI section. It runs through
`/api/ai` (a Vercel function; `npm run dev` serves it locally). Add to `.env.local`, **without** a `VITE_` prefix:

```
GEMINI_API_KEY=AIza…
AI_ALLOWED_EMAILS=you@gmail.com
```

Details and how it's protected: [docs/AI_SETUP.md](docs/AI_SETUP.md).

## Try it with sample data

Easiest: run `npm run dev`, open **Settings → Developer → Load Demo Data** (dev builds only). It adds ~75 days
of realistic data; **Delete Everything** at the bottom of Settings starts fresh again (it also offers to remove
Google Drive backups). **Sign Out** backs up to Drive first, then clears the phone; **Restore from Google Drive**
brings it all back.

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
  features/    today, goals (goals, weight, welcome), nutrition (food picker, My Foods), health (records → facts,
               review, lab history), plan (recovery plan), rehab (+ exercise animations), timeline, injuries,
               documents, log (symptom, measurement, note, sleep, steps), insights, report, settings (+ Apple Health)
  lib/         crypto (E2E encryption), google (sign-in), drive (API), sync, AI client and context, food list,
               nutrition and calorie maths, health facts, recovery-plan rules and the checked exercise guide,
               Apple Health import, daily (sleep/BMI), theme, dates, stats, transitions, platform, haptics, toast
e2e/           Playwright specs, helpers, fake Google, demo-data generator
```

Regenerate icons from `public/icon.svg` with `npm run icons`.
