# AI setup (Gemini)

Reclaim's AI runs through one small server function (`/api/ai`). It holds the Gemini API key, so the key never
reaches the browser, and it only answers requests signed in with Google as **you**.

## 1. Get a Gemini API key

1. Open <https://aistudio.google.com/apikey> with your Google account → **Create API key**.
2. Turn on **billing** for the key's project (Google AI Studio → Billing, or Google Cloud Billing).
   Use the **paid tier** for health data: on the free tier Google may use your prompts and responses to improve
   its products; on the paid tier it doesn't. At personal volumes the cost is very small (see Google's pricing page).

> Your **Google AI Pro** subscription is for the Gemini app. It doesn't include API access — the API key is separate.

## 2. Configure

Local development — add to `.env.local` (these have **no** `VITE_` prefix, so they stay on the server):

```
GEMINI_API_KEY=AIza…
AI_ALLOWED_EMAILS=you@gmail.com
# optional: pin a model instead of the latest Flash
# GEMINI_MODEL=gemini-3.5-flash
```

`VITE_GOOGLE_CLIENT_ID` (from [GOOGLE_SETUP.md](GOOGLE_SETUP.md)) must be set too: the server uses it to check that
the sign-in came from Reclaim.

Restart `npm run dev`. **Settings → AI → AI Server** should say **Ready**.

On Vercel: **Project → Settings → Environment Variables** → add `GEMINI_API_KEY`, `AI_ALLOWED_EMAILS` (and optionally
`GEMINI_MODEL`) → redeploy.

## How it's protected

- **Who:** every request carries your Google sign-in token. The server checks it with Google: it must be issued to
  Reclaim's client ID and belong to an email in `AI_ALLOWED_EMAILS`. Anyone else gets "not allowed".
- **How much:** at most 40 requests per 10 minutes per person, and request bodies up to ~4 MB.
- **What:** each task has a fixed input shape; anything else is rejected. The model's answer must match the expected
  shape too, or it isn't shown.
- **Your data:** only what a feature needs is sent — the note you're structuring, the record you're reading,
  a meal photo or description, or a summary of recent entries and your confirmed health profile. Your name isn't
  sent. Nothing AI suggests is saved until you review it (entries, record facts, meals, the recovery plan).
- **Guard rails:** the recovery plan may only choose exercises from the checked library and the app keeps doses
  inside its ranges; protein, water and calorie targets are worked out by fixed formulas, not by the model.
- **Prompt injection:** notes and documents are passed as data with instructions to never follow text inside them.

## Models and fallbacks

By default Reclaim tries, in order: `gemini-flash-latest` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`.
If a model is overloaded (503 "high demand"), rate-limited (429, common on the free tier), unavailable or slow,
the next one is used automatically. If all of them are busy, the app says "Gemini is busy right now — try again
in a minute" instead of showing an error. A rejected API key stops straight away with a clear message.

To choose your own order, set `GEMINI_MODEL` to one model or a comma-separated list:

```
GEMINI_MODEL=gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite
```

Changing `.env.local` needs a restart of `npm run dev`.

## Backup: Groq (optional)

If every Gemini model is busy, Reclaim can answer with [Groq](https://console.groq.com) instead. It is used only
for text tasks: weekly summary, Ask, note → entries, meal estimates from a description, meal ideas, the health
overview, the recovery plan, and the report summary.
Reading records and meal photos stay on Gemini, because Groq here only handles text.

Free-tier note: on Gemini's free tier, what you send may be used to improve Google's products. For medical
records, a paid key is the safer choice.

1. <https://console.groq.com/keys> → **Create API Key** (the free tier is enough).
2. Add to `.env.local` (and to Vercel's environment variables):

```
GROQ_API_KEY=gsk_…
# optional: default order is openai/gpt-oss-120b, then llama-3.3-70b-versatile
# GROQ_MODEL=openai/gpt-oss-120b,llama-3.3-70b-versatile
```

Settings → AI → AI Server then shows “… + Groq”. Groq answers all at once rather than streaming, usually in
a couple of seconds.

> **Privacy:** Groq is a second company that receives the same data Gemini would (no name). This only happens when
> Gemini is busy. Read Groq's data policy before you add the key, and leave `GROQ_API_KEY` unset if you'd rather
> wait for Gemini.
