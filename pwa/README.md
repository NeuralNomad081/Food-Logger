# Food Logger PWA — production stack

Zero-build PWA. Snap meal photo → tag it → Groq vision estimates calories/macros automatically.

**Stack**
- **Supabase** — Postgres (entries), Storage (private `meals` bucket), Auth (email magic link / OTP)
- **Vercel** — static hosting + `api/analyze` serverless function
- **Groq** — Llama-4 Scout vision model for nutrition estimates (key never leaves server)

All user data isolated per account via Row Level Security; images in per-user storage folders with matching policies.

## Setup (once, ~10 min)

### 1. Supabase

1. Create project at [supabase.com](https://supabase.com) (free tier fine).
2. Dashboard → **SQL Editor** → paste and run [`../supabase/schema.sql`](../supabase/schema.sql). Creates `entries` table, `meals` bucket, all RLS policies.
3. **Authentication → Sign In / Up → Email**: keep Email enabled (magic link on by default).
4. *(Recommended for phone use)* **Authentication → Email Templates → Magic Link**: add the 6-digit code so users can log in inside the installed PWA without leaving it:
   ```html
   <p>Your code: {{ .Token }}</p>
   ```
5. **Project Settings → API**: copy **Project URL** and **anon public** key.

### 1b. Email delivery — IMPORTANT

Supabase's built-in mailer is for development only: **hard cap of a few emails per hour**, delivery is slow and often lands in spam. If sign-in emails don't arrive or you see "email rate limit exceeded", this is why.

Fix for production (5 min, free): use [Resend](https://resend.com) (3k emails/month free) or any SMTP provider.

1. Resend → create API key.
2. Supabase → **Project Settings → Authentication → SMTP Settings** → Enable custom SMTP:
   - Host: `smtp.resend.com`, Port: `465`
   - Username: `resend`, Password: your Resend API key
   - Sender: an address on a domain you verified in Resend (or `onboarding@resend.dev` for testing)
3. Supabase → **Authentication → Rate Limits** → raise "emails per hour" (only editable with custom SMTP on).

Notes: Supabase also enforces 60 s between emails to the same address (the app shows a resend countdown for this). A login code stays valid for 1 hour — an old email's code still works even if a resend is blocked.

### 2. Configure frontend

Edit [`config.js`](config.js) — paste Project URL + anon key. These are public-safe values (RLS protects data).

### 3. Groq

Get API key at [console.groq.com/keys](https://console.groq.com/keys) (free tier available).

### 4. Vercel

```bash
npm i -g vercel
cd pwa
vercel          # link/create project, deploy preview
vercel --prod
```

Then in Vercel dashboard → Project → **Settings → Environment Variables**, add:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (secret!) |
| `GROQ_API_KEY` | from Groq console |
| `GROQ_MODEL` | *(optional)* default `meta-llama/llama-4-scout-17b-16e-instruct` |

Redeploy after adding env vars (`vercel --prod`).

Finally, back in Supabase: **Authentication → URL Configuration** → set **Site URL** to your Vercel URL (so magic links redirect correctly).

### 5. Phone

Open the Vercel URL → sign in → browser menu → **Add to Home Screen**.

iOS note: magic links open in Safari, not the installed app. Use the 6-digit code inside the app instead (step 1.4).

## Architecture

```
Browser (PWA)
 ├── Supabase Auth      — magic link / OTP session (JWT)
 ├── Supabase Postgres  — entries CRUD (anon key + RLS)
 ├── Supabase Storage   — image upload/read via signed URLs (private bucket)
 └── POST /api/analyze  — Vercel function:
       verifies user JWT → loads image (service role) →
       Groq vision → writes entries.analysis → returns result
```

- Images downscaled client-side: 1280px JPEG (sent to Groq) + 200px thumbnail.
- New entry → saved → analysis fires automatically; card updates to `🔥 N kcal · P/C/F`.
- Re-analyze button inside entry editor.
- Export button downloads full JSON (metadata + images as data URLs).
- Service worker caches app shell only — data always live. Bump `CACHE_VERSION` in [`sw.js`](sw.js) when shell files change.

## Data model (`public.entries`)

| column | type | notes |
|--------|------|-------|
| `id` | uuid | client-generated |
| `user_id` | uuid | defaults to `auth.uid()`, RLS key |
| `eaten_at` | timestamptz | editable meal time |
| `meal` | text | breakfast/lunch/dinner/snack |
| `tags` | text[] | user tags, drive suggestions |
| `note` | text | free text |
| `image_path` / `thumb_path` | text | `<user_id>/<id>.jpg` in `meals` bucket |
| `analysis` | jsonb | `{status}` → `{status:'done', calories, protein_g, carbs_g, fat_g, foods[], confidence, model, analyzed_at}` |

## Debugging & logs

**Client** ([logger.js](logger.js)): warnings/errors always print to console; verbose logs (API timings, image sizes, auth events) enable with `?debug=1` on the URL or `localStorage.setItem('foodlog:debug', '1')`. Last 300 log lines always buffered — run `__foodlogDump()` in the console to get them as text (works even when debug was off). Uncaught errors and promise rejections are captured too.

**Server** ([api/analyze.js](api/analyze.js)): one JSON line per stage — auth, entry lookup, image download (KB, ms), Groq call (ms, tokens), save — all tied by a `rid` request id. View in Vercel → Project → Logs (filter `/api/analyze`). Error responses include `requestId` so a user report can be matched to server logs.

## Local development

```bash
cd pwa
npm install          # for the API function
npx vercel dev       # serves static + /api/analyze on localhost:3000
```

(Plain static serving — `npx serve pwa` — works for everything except `/api/analyze`.)

## Costs

Free tiers cover personal use: Supabase (500 MB DB + 1 GB storage), Vercel (100 GB-h functions), Groq (rate-limited free tier). One meal ≈ 150–300 KB storage + one vision call.
