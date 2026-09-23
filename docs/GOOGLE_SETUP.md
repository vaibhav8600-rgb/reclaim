# Google Drive setup (one time, ~10 minutes)

Reclaim signs in with Google directly from the browser: there is no server. Google only needs to know that
your copy of the app is allowed to ask for access. That's a free **OAuth client ID**.

Reclaim asks for one Drive permission: `drive.appdata`, a hidden folder that only Reclaim can see.
It can't read or change anything else in your Drive. Everything in that folder is encrypted on your phone
before upload.

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in with the Google account that has your storage.
2. Click the project picker at the top → **New Project** → name it `Reclaim` → **Create**.

## 2. Turn on the Drive API

1. **APIs & Services → Library**.
2. Search **Google Drive API** → open it → **Enable**.

## 3. Set up the consent screen

1. **APIs & Services → OAuth consent screen** (in newer consoles: **Google Auth Platform → Branding**).
2. App name `Reclaim`, your email as support and developer contact → save.
3. **Audience**: *External*, publishing status **Testing**. Under **Test users**, add your own Gmail address.
   (Testing mode is fine for personal use; only listed test users can sign in.)
4. **Data access / Scopes** → add:
   - `https://www.googleapis.com/auth/drive.appdata`
   - `openid`
   - `.../auth/userinfo.email`

## 4. Create the client ID

1. **APIs & Services → Credentials** (or **Google Auth Platform → Clients**) → **Create credentials → OAuth client ID**.
2. Application type: **Web application**. Name: `Reclaim web`.
3. **Authorized JavaScript origins**: add every address you'll open the app from:
   - `http://localhost:5173` (npm run dev)
   - `http://localhost:4173` (npm run preview)
   - `https://YOUR-APP.vercel.app` (after deploying)
4. No redirect URIs are needed. **Create**, then copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
   The client ID is not a secret; it's safe in the web app.

## 5. Give it to the app

Locally, create a file `.env.local` next to `package.json`:

```
VITE_GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
```

Restart `npm run dev`. **Settings → Google Drive → Connect Google Drive** is now available.

On Vercel: **Project → Settings → Environment Variables** → add `VITE_GOOGLE_CLIENT_ID` with the same value,
then redeploy.

## Using it

- **First device:** Connect → Continue with Google → create a passphrase. Your first encrypted backup uploads.
- **Another device:** Connect → Continue with Google → enter the same passphrase. Everything comes down and
  from then on the devices stay in sync ("Sync Now", and automatically in the background while signed in).
- **The passphrase can't be recovered.** Reclaim never stores or sends it, and Google only has ciphertext.
  Write it down somewhere safe.

## Notes

- Google signs you out of the app after about an hour (tokens are short-lived by design). Background sync pauses
  until you tap **Sync Now**, which signs you back in with one tap.
- In **Testing** mode, Google shows an "unverified app" notice on the consent screen. That's expected for a
  personal app; continue to your own project. Verification is only needed if you publish Reclaim to others.
- On iPhone, sign-in opens Google in a popup sheet. This hasn't been tried on a real device yet. Note that
  Safari and the installed Home Screen app keep **separate** storage on iOS, so connect from the Home Screen
  app itself. If the popup misbehaves there, a redirect-based sign-in can be added as a fallback.
