# Daily reminders (Web Push) — setup

One reminder a day, in the evening, on the free plans of Vercel and Upstash. About 10 minutes, once.

**How it works.** Your iPhone gives Reclaim a *push subscription* (an address at Apple's push service). The server
keeps it in a small Redis database. Once a day, Vercel Cron calls `/api/push`, which sends each subscribed device a
wake-up that carries **no health data** — only `{ "kind": "daily" }`. The phone then decides what to say from its own
data (today's rehab, the morning check, the weekly check-in, today's steps) and shows the notification.

**Timing.** `vercel.json` schedules it at `0 14 * * *` (14:00 UTC = 7:30 pm India time). On Vercel's free (Hobby)
plan a daily job runs at some point *within* that hour, so the reminder arrives between about 7:30 and 8:30 pm. To
change it, edit the schedule (in UTC) and redeploy.

## 1. Make the keys (VAPID)

Push services need a key pair that identifies your server. In the project folder:

```
npx web-push generate-vapid-keys
```

Keep the **private key** secret. It goes only into Vercel's environment variables (and `.env.local` for local
testing), never into the code.

## 2. Add a free Redis database (Upstash)

Vercel → your project → **Storage** → **Create Database** → **Upstash for Redis** (Marketplace) → the **Free** plan →
create it and **connect it to this project**. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project's
environment variables. (If you use an Upstash account directly, set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` instead.) The free tier's limits are far above what one person's reminders use.

## 3. Environment variables

Vercel → your project → **Settings** → **Environment Variables** (Production):

| Name | Value |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | the public key from step 1 |
| `VAPID_PRIVATE_KEY` | the private key from step 1 |
| `VAPID_SUBJECT` | `mailto:` followed by your email |
| `CRON_SECRET` | any long random string (e.g. from `npx web-push generate-vapid-keys` again, or a password manager); Vercel sends it with each cron call and the server refuses calls without it |

Reminders reuse the Google sign-in and `AI_ALLOWED_EMAILS` you already set for AI: only those accounts can turn
reminders on.

Then **redeploy** (the public key is built into the app).

## 4. Turn it on, on the iPhone

1. Open Reclaim **from the Home Screen** (iPhone only sends notifications to Home Screen apps).
2. **Settings → Reminders** → turn on **Daily Reminder**. Sign in with Google if asked, then allow notifications.
3. Tap **Send a Test Reminder**. A notification should arrive within a few seconds.

Turning it off (or deleting the app) removes the device; expired subscriptions are also dropped on the next daily run.

## Checking the daily run

Vercel → your project → **Settings → Cron Jobs** lists the job and lets you **Run** it now. Its log shows
`{ "sent": 1, "removed": 0 }` when a device was reminded.
