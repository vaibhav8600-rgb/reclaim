# Reclaim — Plan

**Reclaim — Get back to your life.** A private, local-first recovery journal for one person on an iPhone 13. AI sits **on top of** structured data; it is never the database.

**Track → Structure → Analyze → Explain → Prepare.** It never diagnoses.

## Architecture

```
iPhone (Home Screen PWA)
  React + Vite + TypeScript + Tailwind
  Dexie (IndexedDB)  ← the source of truth, works offline
      │
      ├── Backup: JSON file → share sheet → Files / Google Drive      (v0.1)
      ├── Vercel Function /api/ai → Gemini API (key stays server-side) (v0.4)
      └── Google Drive API: encrypted snapshots + documents          (v0.3)
```

No backend server, no Supabase, no .NET. Add infrastructure only when a phase needs it.

### Decisions

| Decision | Why |
|---|---|
| Dexie + `useLiveQuery`, no Zustand/TanStack Query | Dexie is already reactive; a second store would duplicate state |
| Timeline is **derived** from typed tables | A stored `TimelineEvents` table means double writes and drift |
| Every record: `id, createdAt, updatedAt, deletedAt?` | `deletedAt` tombstones let backups/sync merge deletes correctly |
| `source` on every entry (`user`, `ai_estimate`, `user_confirmed`, …) | AI values are never silently treated as fact |
| Restore = merge, newest `updatedAt` wins | Never blind-overwrite; preview before writing |
| Backup via share sheet in v0.1 | Google Drive app appears in the iOS share sheet — Drive backup with zero OAuth |
| Gemini **paid tier** for health data | Free-tier API content may be used to improve Google's products |
| `navigator.storage.persist()` + Home Screen install | Safari evicts storage of sites not used for 7 days; Home Screen apps are exempt |

### iPhone constraints (designed around)

- Must be **added to Home Screen** for persistent storage, full screen, and (later) push notifications.
- Inputs ≥ 16px (Safari zooms otherwise); safe-area insets for notch and home indicator.
- Reminders need Web Push from a server (iOS 16.4+, installed PWA only) → deferred.
- Service worker needs HTTPS → test on the phone via the Vercel URL, not LAN http.

## Design language — Apple HIG, iOS 26 Liquid Glass

- **System foundations:** SF Pro text (SF Pro Rounded for numbers), 17pt body that follows the iPhone's Dynamic Type setting, iOS system colours (grouped backgrounds, labels, separators; pure black in dark mode) with a Reclaim teal tint.
- **Navigation:** large titles that collapse into a glass bar on scroll; glass circle back/action buttons; floating glass tab bar (Today, Rehab, Timeline, Injuries) whose selection lens slides between tabs with the + action as a separate button; Settings behind the profile button, as in Health.
- **Structure:** inset grouped lists with inset hairlines, Settings-style coloured icon tiles, grouped-section headers and footers, destructive actions as red rows at the end.
- **Input:** sheet-style forms with ✕ / ✓; native iOS pickers for dates, body region and status; segmented controls; capsule buttons; swipe-down to dismiss the Quick Log sheet; system haptic on save (iOS 18+).
- **Copy:** Title Case for titles and buttons, sentence case for descriptions.
- **Motion:** View Transitions give iOS navigation — push slides in from the right, back reverses it, forms rise as sheets over a receding screen and drop away on close, tabs crossfade. Segmented selections slide, charts draw in, the progress ring fills, new rows fade in, set checks pop, the Quick Log sheet slides out. All of it switches off with iOS Reduce Motion.

## UX principles

1. **A pain log in 2 taps.** `+` → tap a number → saved, with Undo. Injury is remembered.
2. **Calm, not gamified.** No streaks, no guilt. "You completed 9 of 12", never "you failed".
3. **Honest charts.** Severity uses one warm hue light→dark with the number always printed; no traffic lights. Trends are shown as data, not verdicts.
4. **Thumb-first.** The + log button and pain numbers sit in thumb reach; tap targets ≥ 44pt. Forms confirm with ✓ top-right, per Apple convention.
5. **Your data.** Everything stays on the device, with visible backup status and nudges.
6. **Light and dark** follow the system (or a fixed choice in Settings).
7. **Beginner-friendly.** Every screen says what it's for in one line and has one obvious main action. Empty
   screens teach what to do next. Sensible defaults (times prefilled, last unit remembered) so most logs are a
   tap or two. Advanced fields stay out of the way until needed. Plain words, with medical terms explained.
8. **One app, not a pile of features.** A feature earns its place only if it's used; new areas fold into the
   existing structure (Today, Track, Health) instead of adding screens to wander through.

## Phases

| Phase | Scope | Status |
|---|---|---|
| **0.1 Daily habit** | Injuries, quick pain log, symptoms (11 types, triggers), measurements (weight, waist, grip, ROM, walk, custom), notes, derived timeline, 14/30/90-day pain charts, JSON backup + merge restore, storage protection, install guidance | ✅ built |
| **0.2 Rehab** | Starter library (24 exercises) + custom exercises; plan (sets, reps or hold time, load or band note, times/day, days/week, pause); live session with per-set ticks and editable reps/load, pain before/during/after, auto-saved draft; weekly adherence ring; per-exercise progression chart; sessions on Today, the timeline and each injury | ✅ built |
| **0.3 Google Drive** | Google sign-in in the browser (`drive.appdata` scope only); end-to-end encryption (PBKDF2-SHA256 600k → AES-256-GCM, passphrase never leaves the device); encrypted snapshots with pull-merge-push sync and background sync while signed in, last 10 kept; unlock on a new device; medical records (PDF/photos, 25 MB) stored locally for offline viewing and encrypted in Drive, linked to injuries and the timeline. Setup: [GOOGLE_SETUP.md](GOOGLE_SETUP.md) | ✅ built |
| **0.4 AI** | `/api/ai` Vercel function (also served by `npm run dev`/`preview`): Google-token + email allowlist, rate limit, size limits, schema-validated input and output, provider-agnostic (Gemini `generateContent` with JSON schema). Consent first. Note → draft entries with quoted evidence → review → saved as `user_confirmed`; document summaries ("The report states…", findings, questions) labelled as AI; weekly summary and Ask with the four-part answer; printable clinician report (on-device numbers, optional AI summary). Setup: [AI_SETUP.md](AI_SETUP.md) | ✅ built |
| **0.5 Nutrition** | Protein first: a meal is a name and grams of protein, with optional foods that add up; daily protein goal (shown per kg of latest weight); Nutrition screen with today's ring, 7-day bars against the goal, saved meals logged in one tap (with Undo) and today's meals; Today card; meals on the timeline (Meals filter), in the clinician report and in the AI context. AI estimate from a photo and/or description → foods marked "AI estimate" until edited → saved as `user_confirmed` only on ✓; the photo is resized, sent once and never stored. Groq as an optional text-only backup when every Gemini model is busy | ✅ built |
| **0.6 Medical history** | Add many records at once (PDFs/photos); AI reads each (one at a time, free-tier friendly, resumes if interrupted), files it under the title, type and date printed on it, and extracts facts — conditions, medicines, allergies, lab results (value, unit, printed range), scan findings, procedures, vitals — each quoting the printed words. Facts join the **Health Profile** only after review; low/high worked out from simple printed ranges, otherwise the report's own flag. Lab history per test with chart; facts editable, deletable, or added by hand. Confirmed history goes into the AI context (weekly summary, Ask). **Water**: one-tap 250/500 ml on Today and Nutrition, daily goal (30–35 ml/kg guidance with a heart/kidney caveat) | ✅ built |
| **0.7 Recovery plan** | Vetted library: each starter exercise has the injuries it suits, dose ranges, progression, cautions and the published guideline behind it (JOSPT CPGs, OARSI, pain-monitoring model). AI drafts a plan from the open injuries, pain trend, rehab so far and Health Profile, choosing **only** library exercises; the app drops anything else and clamps doses to the ranges. Protein (1.6 g/kg, ISSN) and water (~33 ml/kg, EFSA context) targets are computed, not AI, and held back when records show kidney disease, heart failure or a fluid restriction. Weekly check per exercise from logs (progress / keep going / ease off, pain-monitoring model). Safety rules, questions for the physio, full citations. Nothing changes until “Use This Plan” | ✅ built |
| **0.8 Exercise animations** | Looping 2D demonstrations for all 24 starter exercises: one figure rig (side view, two-bone IK so hands and feet stay planted while the body moves), key poses per exercise with a caption per phase (“Lower slowly, 3–4 s”), the working part in the accent colour; custom views where side-on can’t show it (from above, behind, the front). On the exercise screen, in sessions (“How to”) and in the recovery plan. Pauses off screen or on tap; Reduce Motion shows the start and key positions still | ✅ built |
| **0.9 Daily basics** | Sleep (bed and wake times, quality) and steps / active minutes, logged by hand in a tap or two. Weight page: chart, goal, BMI from a height in the profile. One Goals page for every target (weight, protein, water, steps, sleep). Today opens with "at a glance" rings (protein, water, steps, sleep) and a first-run setup (name, height, weight, goals — all skippable). Quick Log gains Sleep, Steps and Weight. Sleep and steps on the timeline, in the weekly summary and Ask | ✅ built |
| **0.10 Nutrition and Apple Health** | Calories, protein, carbs, fat, fiber (and sugar, sodium from labels) per food and meal; a built-in list of ~110 common Indian and everyday foods (per 100 g, familiar servings, marked approximate) with search, recents and portions; My Foods from nutrition labels; recipes that make several servings (one serving logged by default); AI estimates now include carbs, fat and fiber; a calorie goal from Mifflin–St Jeor × activity (−500 / +300, never below 1,200 / 1,500 kcal); carbs and fat guides from the calorie and protein goals; Today card with what's left; 7-day calories/protein chart and weekly stats; AI meal ideas that fit what's left, respect diet preference and flag records-related caveats; a fifth ring for calories. **Apple Health** through an iPhone Shortcut: steps, exercise minutes, weight and sleep (segments joined into nights), copied by a two-action Shortcut (today’s steps) and pasted on the Steps page or in Settings (a Shortcut can’t open a Home Screen web app); a longer line format adds weight and sleep, idempotent and respectful of deletions and hand-logged nights | ✅ built |
| **0.11 Safe recovery** | For spine, tendon and multi-injury recovery. **Warning signs**: a check for the few signs that need a doctor now or soon (cauda equina and nerve-root signs for the lower back; myelopathy, stroke-like and trauma signs for the neck; infection, blood clot, rupture and locking for joints), picked by the open injuries; weekly on Today when a back or neck injury is open, and again after numbness, tingling or weakness is logged; a ticked sign is saved to the timeline. **One plan across injuries**: every vetted exercise carries adjust-for notes by body region (kneeling on a sore knee, weight through the hands with elbow tendons, leaning forward with a sore back, straight-leg raise with nerve pain); shown on the plan, the exercise and in sessions, and given to the AI so it prefers exercises that don't conflict. **Next-morning check**: the day after a session, Today asks for this morning's pain; settled means at most 5/10 and within 1 of the pain before (Silbernagel 2007), and a session that hadn't settled makes this week's check say ease. **Flare-up mode**: offered when pain reaches 7/10, or from Rehab; day-by-day guidance on Today (keep moving gently, half the usual sets, change position, heat or ice, the warning-signs link), new sessions start at half the sets, and its start and end are noted on the timeline. **How far it reaches**: back and neck symptoms can say how far down the leg or arm they go (spine only → foot or hand); the injury page shows the latest and the trend (moving back towards the spine vs spreading, which points to the physio and the warning signs), and so do the timeline and the AI | ✅ built |
| **0.12 Joints and habits** | **Weekly check-in** (Today, weekly while an injury is open; after the safety check when both are due): the PEG scale (pain, and how much it gets in the way of enjoying life and usual activities; Krebs 2009), how long sitting and walking are comfortable, nights woken by pain, and the Patient-Specific Functional Scale (up to three of the user's own hardest activities, rated 0–10, the same ones each week; Stratford 1995). Chosen over Oswestry / NDI / KOOS / PRTEE, which are copyrighted and need a licence to reproduce in an app; PEG and PSFS are free and validated across back, neck, knee and elbow. **How You're Doing** page: first vs latest (a 2-point change counts), charts; in the doctor report and the AI context. **Weight and the knees**: kg lost from the 6-month peak × 4 = kg less on each knee per step (Messier 2005), and what the goal would take off. **Gentle steps target**: this week ≈ 10% (at least 500) above the recent average, never above the goal, with low-impact suggestions. **Personal patterns** on the injury page (and in the AI context): the injury's daily pain against steps the day before (split at the user's median), the night's sleep, and a rehab session the day before; reported only with 5+ days each side and a 1+ point difference, worded as patterns not proof. **What this is** cards (collapsed, on the injury page): disc bulge in the lower back or neck, tendon problems, ligament sprains and grade 1–2 tears, general low back and neck pain — matched from the name, diagnosis and region, each point sourced (Brinjikji 2015, Nakashima 2015, Chiu 2015, Coombes 2010, the CPGs), with the warning-signs link for the spine; loaded with the page, not at start-up. **Daily reminders** (Web Push, free plans): Vercel Cron once a day (14:00 UTC ≈ 7:30–8:30 pm IST on Hobby) calls `/api/push`, which wakes each subscribed device with no health data; the service worker (`public/push-sw.js`) picks at most two things left for today from the phone's own data. Subscriptions in Upstash Redis over REST, only for the Google-signed-in allowlisted owner, only for known push-service hosts (no server requests to arbitrary URLs), at most 10 devices, expired ones dropped; the cron needs `CRON_SECRET`. Setup: docs/PUSH_SETUP.md | ✅ built |
| **0.13 Records+ and privacy** | **Multi-page reports**: in Add Records, photos can be marked as pages of one report and become one PDF record (a minimal PDF writer, JPEG pages shrunk until the file fits the AI's 3 MB), so storage, Drive and preview are unchanged and the AI reads the pages together; findings and facts carry their page number. **Since last time**: a record shows what changed from the previous record of the same kind (values and flags, with the direction), what's new and what's no longer listed ("no longer prescribed" for prescriptions), from confirmed facts, matched by kind and name. **Medicines**: one row per medicine (latest dose, last date, how many records), prescribed in the last 3 months vs earlier; recent ones in the doctor report. **Show what's sent** (Settings → AI, off by default): before each request, a sheet with exactly what will go (the context section by section, files by name and size) and what never does, Send or Cancel, and one look for a whole batch of records; the sheet loads only when needed | ✅ built |
| **0.14 Fitness** | 31 general exercises (bodyweight, dumbbell and gym strength; walking, cycling, elliptical, swimming, jogging, rowing; mobility) beside the rehab library, filtered by kind. **Safe with injuries**: every fitness exercise says how it sits with an open injury by region — *adjust* (a tip) or *ask your physio first* (heavy spinal loading with a disc problem: deadlift, back squat, Romanian deadlift, rowing, crunches; weight overhead with a neck problem; running on an injured knee) — in the library (badges), the exercise, the workout editor and the session; rehab exercises keep their own notes. **Workouts**: templates (exercises, sets, reps or minutes, kg, rest), four starters to add in a tap (gentle home full body, low-impact cardio, gym lower and upper body), started from Rehab and resumable; the session screen gains a rest timer after each ticked set (+15 s, skip), cardio in minutes, weight fields, and an effort rating (RPE 1–10). Duration and weight lifted on the timeline; personal bests (heaviest weight, most reps, longest hold) announced when beaten and shown per exercise; workouts are kept out of rehab adherence, the reminders' rehab check and the patterns; the AI context gets a workouts summary. Looping demonstrations for all 31 fitness exercises with the same figure (squats and hinges with planted feet, push-ups with planted hands, a barbell shown end-on, pedalling and elliptical paths, a continuous swimming stroke, cable machines; side plank and open book drawn from the front or above), sharing a scene kit with the rehab ones | ✅ built |
| 0.15 Reports, export, navigation | A Sunday report across every area (nutrition, activity, sleep, weight, recovery); the doctor report as a PDF listing its attachments; export as a ZIP (data + documents) and CSV; tabs revisited (Home · Health · Track · AI · More) once the new areas are in daily use | |
| Later | A tap-the-body map for injuries, barcode scanning for packaged foods, Capacitor wrapper | |

Deliberately **not** planned: social feeds, leaderboards, coaches, payments, a marketplace, wearable and smart-scale
integrations, a cloud database. A large commercial platform needs those; one person's health app doesn't.

AI answers always use the shape: *what the data shows · possible patterns · what the data can't establish · things to discuss with your clinician.* Correlations are reported as counts ("5 of 7 days…"), never causes.

## Testing

Playwright end-to-end suite against the production build, as an iPhone 13 in WebKit and Chromium (see README).
It covers:
- first run and the quick log (with undo and the remembered injury)
- creating, editing, deleting and backdating symptoms, measurements and notes
- dashboard and injury numbers, checked against values computed independently on a ~75-day realistic dataset
- timeline filters and paging
- rehab: plan → session → draft survives a reload → adherence and progression
- backup: export → wipe → restore gives identical data, merge rules, and rejection of invalid files
- navigation motion, Reduce Motion, dark mode and offline use
- Google Drive against a fake Google (`e2e/fake-google.ts`), where two browser contexts act as two devices:
  encrypted first backup (Google only sees ciphertext), passphrase rules, wrong-passphrase rejection, a new
  device receiving identical data, two-way sync of additions and deletions, snapshot pruning, cancelled sign-in, disconnect
- medical records: add, preview, edit, delete and undo, the 25 MB limit, and encrypted upload (including files
  over 5 MB) that decrypts on a second device, with deletion removing the Drive copy
- AI in the app against a mocked `/api/ai`: consent (and "Not Now" sends nothing), sign-in, the four-part answer,
  never sending the person's name, note → review → only confirmed entries saved, document summaries, the
  clinician report (numbers checked against the data, print styles), server errors explained, Settings switch
- the `/api/ai` handler in Node: access control, token-check caching, input limits, rate limit, output validation,
  and the prompt safety rules
- security: every screen under the production Content-Security-Policy, and no secrets in the bundle
- nutrition: protein goal, logging by grams, foods adding up (comma decimals), saved meals with one-tap log and
  undo, edit/delete/undo, the photo and description estimates (what's sent, nothing saved before ✓, edited
  foods lose the estimate mark, saved as `user_confirmed`), "not food", and the 7-day chart checked against the demo data
- medical records: bulk import, record reading with repair of small model slips, review (one or all), range flags,
  lab history, the overall health summary, injury suggestions from records, and the schema rules Gemini accepts
- recovery plan: only checked-library exercises in range, target formulas and their holds, the weekly check
- exercise demonstrations: every starter exercise, captions per phase, pause, Reduce Motion stills
- daily basics: sleep, steps (one per day), weight and BMI, goals and suggestions, first-run setup, Quick Log tiles
- nutrition 0.10: the food list's numbers (energy consistent with macros), search, portions, recents, My Foods from
  a label, recipes by servings, calorie suggestion and floors, meal ideas
- Fitness: library ids, cautions and starters consistent; ask-physio before adjust, one per region; volume, minutes and personal bests (a first time isn't a best); workouts outside rehab adherence; the library badges; a workout with the rest timer, effort and a new best
- Records+: the PDF writer's cross-reference offsets and page sizes; photos → one PDF record; changes, new and no-longer-listed facts since the previous record; one entry per medicine, recent vs earlier; the preview: Cancel sends nothing, Send sends
- Patterns and explanations: a real steps difference found, none or too few days say nothing, the reverse wording; which card fits which injury (and none rather than a wrong one); both on the injury page
- Reminders: only the owner subscribes, only real push services, 10 devices at most, the cron secret, expired devices dropped, no health data in the push; the phone's choice of what to remind about
- Joints and habits: PEG and PSFS scores, when the check-in is due, first vs latest with a 2-point threshold, same activities week to week, the report; knee load from the 6-month peak and to the goal; the steps ramp
- Safe recovery: next-morning settled rule, which sessions are asked, and the weekly check easing off; flare-up days and halved sessions, offered at 7/10 and ended with a timeline note; reach scales, trend (centralising / spreading), the form only for back and neck, timeline and injury page; warning signs picked by injury region, weekly and after a nerve symptom, a ticked sign saved with the right urgency; adjust-for notes across injuries (one per region), on the exercise page and sent to the AI
- Apple Health import: parsing (segments → nights, pounds → kg, junk skipped), semicolon lines with thousands and decimal commas, a bare number as today’s steps, paste import and the steps-page Paste, idempotency
- appearance (System/Light/Dark before first paint), profile photo, units (cm/in, kg/lb), sign out and restore,
  delete everything, and sync uploading only when something changed
- a light/dark screenshot tour of every screen, including the AI screens

## Phase audits

After every phase: UI/UX (screenshot review, light and dark), security, and performance, with fixes, before
the phase is called done.

**0.4 audit.** Found and fixed:
- **Bugs:** the consent sheet's button submitted the note form, so a note was saved twice (it now renders
  outside the form, with typed buttons); zod's eval probing violated the CSP (switched to jitless mode); the
  AI server's token-cache check had an operator-precedence bug; a literal `</data>` in a note could close the
  data block early (now escaped).
- **Performance:** startup JavaScript cut from 610 KB to ~440 KB (routes code-split and idle-preloaded, zod
  and backup loaded on demand). With three years of data on a phone-speed CPU: cold start 1.9 → 1.1 s,
  Timeline 3.3 → 0.8 s, "Show Older" about 6 s → 0.5 s (query once and page in memory, memoized rows,
  reused date formatters, `content-visibility` on off-screen days, no blur on day headers).
- **UI:** invisible scale buttons on cards, an overlong AI-estimate label, a wrapping report button, and a
  misaligned Settings toggle.
- **Security:** production headers added (CSP, `frame-ancestors 'none'`, nosniff, HSTS, `Referrer-Policy`,
  `Permissions-Policy`); `npm audit` is clean; no `innerHTML`; no secrets in the bundle.

**0.5 audit.** Found and fixed:
- **UI:** the food card's "Protein g" label wrapped onto two lines (now "Protein" with the unit beside the value);
  the "AI estimate, checked" marker was cut off on long meal rows (moved before calories). Reviewed Nutrition, the
  meal sheet (empty and estimated), Today, Quick Log, the timeline and the report in light and dark.
- **Honesty/privacy:** the AI consent sheet said data only goes to Gemini — it now mentions meal photos and the
  optional Groq backup. The meal photo is never stored; blob URLs are revoked.
- **Security:** the new AI task accepts only a JPEG (size-capped) and/or a 500-character description wrapped as
  data; output is bounded and schema-checked; backups validate meals, saved meals and the protein goal.
- **Performance:** Nutrition and the meal sheet are code-split (6 KB and 10 KB); Today only adds a small card;
  meals are read through the `recordedAt` index. No new dependencies.

**0.6–0.8 audits.** Found and fixed: Gemini silently rejected a large `maxItems` on facts (forced the unenforced
path, which produced malformed answers) — now capped at 20 and tested; record answers repair small slips; a
too-slow fallback exceeded Vercel's limit (shorter evidence, longer time budget only where needed); sign out now
refuses to clear the device unless a fresh backup finished; review nudge opens Review All; plan layout and wrapped
target text; exercise-animation start frames, zoomed forearm scenes, and angle paths that took the long way round.

**0.9–0.10 audit.** Found and fixed: editing a meal and removing its only food with calories kept the old calorie
total (saving merges, so every nutrient is now written explicitly); profile hooks couldn't tell "loading" from "no
profile" (new users saw blank screens); undo for quick pain logs and one-tap meals hard-deleted (a sync could bring
entries back); sync uploaded a full snapshot on every app open (now only after changes); water under a litre showed
as "0.3 L"; a pre-selected sex on the calorie form. Apple Health moved from an import link to copy and paste
after review: a Shortcut can only open Safari, whose storage is separate from the Home Screen app, so a link would
have imported into the wrong copy. Security: import only on the user's own paste (no link can slip data in); import
size is capped. Performance: every new screen is split out (Goals, Weight, Nutrition, food picker, food list); the main
bundle grew by a few kB for Today's rings.

## Success criteria for 0.1

Use it every day for two weeks. If logging feels like a chore, fix friction before adding features.
