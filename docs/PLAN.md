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
6. **Light and dark** follow the system.

## Phases

| Phase | Scope | Status |
|---|---|---|
| **0.1 Daily habit** | Injuries, quick pain log, symptoms (11 types, triggers), measurements (weight, waist, grip, ROM, walk, custom), notes, derived timeline, 14/30/90-day pain charts, JSON backup + merge restore, storage protection, install guidance | ✅ built |
| **0.2 Rehab** | Starter library (24 exercises) + custom exercises; plan (sets, reps or hold time, load or band note, times/day, days/week, pause); live session with per-set ticks and editable reps/load, pain before/during/after, auto-saved draft; weekly adherence ring; per-exercise progression chart; sessions on Today, the timeline and each injury | ✅ built |
| **0.3 Google Drive** | Google sign-in in the browser (`drive.appdata` scope only); end-to-end encryption (PBKDF2-SHA256 600k → AES-256-GCM, passphrase never leaves the device); encrypted snapshots with pull-merge-push sync and background sync while signed in, last 10 kept; unlock on a new device; medical records (PDF/photos, 25 MB) stored locally for offline viewing and encrypted in Drive, linked to injuries and the timeline. Setup: [GOOGLE_SETUP.md](GOOGLE_SETUP.md) | ✅ built |
| **0.4 AI** | `/api/ai` Vercel function (also served by `npm run dev`/`preview`): Google-token + email allowlist, rate limit, size limits, schema-validated input and output, provider-agnostic (Gemini `generateContent` with JSON schema). Consent first. Note → draft entries with quoted evidence → review → saved as `user_confirmed`; document summaries ("The report states…", findings, questions) labelled as AI; weekly summary and Ask with the four-part answer; printable clinician report (on-device numbers, optional AI summary). Setup: [AI_SETUP.md](AI_SETUP.md) | ✅ built |
| **0.5 Nutrition** | Protein first: a meal is a name and grams of protein, with optional foods that add up; daily protein goal (shown per kg of latest weight); Nutrition screen with today's ring, 7-day bars against the goal, saved meals logged in one tap (with Undo) and today's meals; Today card; meals on the timeline (Meals filter), in the clinician report and in the AI context. AI estimate from a photo and/or description → foods marked "AI estimate" until edited → saved as `user_confirmed` only on ✓; the photo is resized, sent once and never stored. Groq as an optional text-only backup when every Gemini model is busy | ✅ built |
| **0.6 Medical history** | Add many records at once (PDFs/photos); AI reads each (one at a time, free-tier friendly, resumes if interrupted), files it under the title, type and date printed on it, and extracts facts — conditions, medicines, allergies, lab results (value, unit, printed range), scan findings, procedures, vitals — each quoting the printed words. Facts join the **Health Profile** only after review; low/high worked out from simple printed ranges, otherwise the report's own flag. Lab history per test with chart; facts editable, deletable, or added by hand. Confirmed history goes into the AI context (weekly summary, Ask). **Water**: one-tap 250/500 ml on Today and Nutrition, daily goal (30–35 ml/kg guidance with a heart/kidney caveat) | ✅ built |
| 0.7 Recovery plan | Vetted exercise library with references; personal plan (rehab, protein, calories, water) from confirmed facts; weekly adaptation from logs | next |
| 0.8 Exercise animations | Looping 2D figure animations for the library | |
| Later | Apple Health data via Shortcuts export, Web Push reminders, Capacitor wrapper, multi-device merge | |

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

## Success criteria for 0.1

Use it every day for two weeks. If logging feels like a chore, fix friction before adding features.
