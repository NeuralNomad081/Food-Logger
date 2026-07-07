# Food Logger 🍎

Mobile-first PWA: snap a photo of your meal, tag it, and AI estimates calories & macros.

**➡️ The production app lives in [`pwa/`](pwa/) — see [pwa/README.md](pwa/README.md) for setup & deployment.**

## Stack

-   **Frontend**: zero-build vanilla JS PWA (installable, offline shell)
-   **Database & Auth**: Supabase (Postgres + Storage + email magic link, RLS per user)
-   **Compute**: Vercel (static hosting + `api/analyze` serverless function)
-   **AI**: Groq — Llama-4 Scout vision for nutrition estimates
-   Schema: [`supabase/schema.sql`](supabase/schema.sql)

## Repository layout

-   [`pwa/`](pwa/) — the app: static PWA + `api/analyze` Vercel function
-   [`supabase/`](supabase/) — database schema and RLS policies

An earlier FastAPI + Next.js prototype was removed; it lives in git history if ever needed.

## License
MIT
