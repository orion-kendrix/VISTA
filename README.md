# VISTA — Visual Intelligence & Smart Task Agent

A LinkedIn post scheduling agent. Upload a certificate → answer 5 AI-generated
questions → get a tailored LinkedIn post → approve via WhatsApp → auto-publish
at the scheduled time.

**Status: code-complete MVP.** Everything below `src/` and `netlify/` works
end to end; going live only needs credentials (see Deploy).

## Project Structure

```
vista/
├── docs/               ← Rules, architecture, handoffs, known issues
├── supabase/           ← Database schema + RLS + seed (FROZEN after Phase 0)
├── netlify/functions/  ← Serverless backend (Gemini, LinkedIn, WhatsApp, cron)
├── src/widget/         ← Frontend FAB widget (vanilla JS, embeddable)
├── src/shared/         ← Frozen API contract (api.js) + enums (constants.js)
├── scripts/            ← test-functions.js — contract smoke test
└── public/             ← Deploy target (build copies src/widget + src/shared here)
```

## Run locally

```bash
npm install
cp .env.example .env        # fill in at least Supabase + Gemini keys
netlify dev                 # http://localhost:8888
```

- **Mock mode (no keys needed):** http://localhost:8888/src/widget/ — full
  4-step flow with fake data.
- **Live mode:** http://localhost:8888/src/widget/?live — hits the real
  functions. Set `ALLOW_ANON_GENERATION=true` in `.env` to test the Gemini
  steps before LinkedIn OAuth is configured.
- **Smoke test the functions:** `npm run test:functions` (with `netlify dev`
  running). No API keys required — it verifies auth guards and validation.

## Deploy (summary — full runbook in docs/HANDOFF_2.md)

1. **Supabase**: new project → run `supabase/migrations/001_initial_schema.sql`
   then `002_rls_policies.sql` in the SQL editor → create a **public** Storage
   bucket named `certificates`. (Skip `seed.sql` in production — it's dev data.)
2. **Gemini**: key from aistudio.google.com.
3. **LinkedIn**: create an app → add products "Sign In with LinkedIn using
   OpenID Connect" + "Share on LinkedIn" → redirect URI
   `https://<site>.netlify.app/.netlify/functions/callback`.
4. **Netlify**: connect this repo → set every variable from `.env.example` →
   deploy.
5. **CallMeBot** (optional): activate per callmebot.com; without it the widget
   shows manual approval links.
6. **Cron**: POST `https://<site>.netlify.app/.netlify/functions/scheduler`
   every 15 min with header `Authorization: Bearer <SCHEDULER_SECRET>`
   (cron-job.org works).
7. **Embed on Vortex**: one line —
   `<script src="https://<site>.netlify.app/widget/embed.js"></script>` —
   and add the Vortex origin to `EXTRA_ALLOWED_ORIGINS`.

## For every AI working on this project

Read `docs/RULES.md` first. No exceptions. Then the latest `docs/HANDOFF_*.md`
and `docs/KNOWN_ISSUES.md`.
