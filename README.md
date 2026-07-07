# Food Logger 🍎

Mobile-first PWA: snap a photo of your meal, tag it, and AI estimates calories & macros.

**➡️ The production app lives in [`pwa/`](pwa/) — see [pwa/README.md](pwa/README.md) for setup & deployment.**

## Stack

-   **Frontend**: zero-build vanilla JS PWA (installable, offline shell)
-   **Database & Auth**: Supabase (Postgres + Storage + email magic link, RLS per user)
-   **Compute**: Vercel (static hosting + `api/analyze` serverless function)
-   **AI**: Groq — Llama-4 Scout vision for nutrition estimates
-   Schema: [`supabase/schema.sql`](supabase/schema.sql)

## Legacy

`backend/` (FastAPI + EasyOCR + Gemini) and `frontend/` (Next.js) are an earlier prototype, kept for reference; not part of the deployed app.

## License
MIT
