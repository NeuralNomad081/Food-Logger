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

## Local development

```bash
cd pwa
npm install          # for the API function
npx vercel dev       # serves static + /api/analyze on localhost:3000
```

(Plain static serving — `npx serve pwa` — works for everything except `/api/analyze`.)

## Costs

Free tiers cover personal use: Supabase (500 MB DB + 1 GB storage), Vercel (100 GB-h functions), Groq (rate-limited free tier). One meal ≈ 150–300 KB storage + one vision call.
