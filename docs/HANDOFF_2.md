# HANDOFF_2.md — Phases 2 & 3: Functions + Integration Complete
> Written by: Claude Fable 5 (claude.ai)
> Date: 2026-06-12
> Phases: 2 (serverless functions) and 3 (integration) — built together
> Status: Complete (pending live-credential smoke test, see runbook)

---

## What Was Built

All six Netlify functions, four shared utils, the production `embed.js`, the
real implementations inside `src/shared/api.js`, and the final
`netlify.toml` + `.env.example`. The system is code-complete end to end:
upload → Gemini questions → Gemini post → Supabase persistence → WhatsApp
approval → token-validated state change → cron publish to LinkedIn.

Auth model (the one piece Phase 0 left open): there are no server sessions
and no new tables — the OAuth callback signs a stateless HMAC token
(`SESSION_SECRET`) containing the user's UUID, hands it back via URL
fragment, the widget stores it, and every function verifies it per-request.
TTL is 55 days, deliberately inside LinkedIn's ~60-day token window.

## File Map

```
netlify/functions/
  _utils/http.js            — CORS (origin echo), json/html responses, body parse
  _utils/tokenSecurity.js   — randomToken, HMAC sign/verify, requireSession
  _utils/supabaseClient.js  — ALL DB + Storage access (service role)
  _utils/linkedinClient.js  — OAuth URLs, token exchange, /rest publish w/ image
  callback.js               — login redirect + code exchange + session handoff
  analyze-questions.js      — image → Gemini → exactly 5 questions (strict parse)
  generate-post.js          — Q&A + 11 settings → Gemini → post text
  schedule-whatsapp.js      — persist post + image + questionnaire, CallMeBot ping
  approve.js                — approve_post() RPC, themed HTML result page
  scheduler.js              — Bearer-protected cron publisher, batch of 5
src/widget/embed.js         — single <script> tag loader for Vortex
src/shared/api.js           — mocks preserved; real fetch + session + 401 → AuthRequiredError
netlify.toml                — build copies src→public, dev config, CORS headers
.env.example                — 7 new vars (see below)
```

## API Contracts (implemented exactly as api.js declares)

```
POST /.netlify/functions/analyze-questions   (Bearer session*)
  { image, mimeType }                → 200 { questions[5] } | 400 | 401 | 413 | 502
POST /.netlify/functions/generate-post       (Bearer session*)
  { questions, answers, microSettings } → 200 { postText } | 400 | 401 | 502
POST /.netlify/functions/schedule-whatsapp   (Bearer session — always)
  { postText, imageBase64?, imageMimeType?, whatsappNumber(E.164),
    scheduledAt(ISO future), microSettings, questions, answers }
                                     → 200 { postQueueId, status:'pending_approval',
                                             whatsappDelivered, approveUrl? }
GET  /.netlify/functions/approve?token&decision=approved|rejected → HTML page
GET  /.netlify/functions/callback?action=login&return_to=…        → 302 LinkedIn
GET  /.netlify/functions/callback?code&state                      → 302 return_to#vista_session=…
POST /.netlify/functions/scheduler  (Authorization: Bearer SCHEDULER_SECRET)
                                     → { found, published[], failed[], skipped[] }

* analyze/generate accept anonymous calls when ALLOW_ANON_GENERATION=true.
```

## Environment Variables (new this phase — full list in .env.example)

```
SESSION_SECRET=            # HMAC key for session tokens — 32+ random chars
CALLMEBOT_API_KEY=         # optional; empty = manual approval link fallback
GEMINI_MODEL=gemini-2.5-flash
LINKEDIN_VERSION=202506
SUPABASE_STORAGE_BUCKET=certificates
ALLOW_ANON_GENERATION=false
EXTRA_ALLOWED_ORIGINS=     # e.g. the Vortex origin, for OAuth return URLs
```

## Decisions Made

| Decision | Reason |
|----------|--------|
| Stateless HMAC sessions, not a sessions table | Schema is frozen (R3); Netlify functions share no memory; HMAC verify is one crypto call per request. |
| `claimPost()` = UPDATE … WHERE status='approved' | The status guard makes processing-before-publish atomic — a retried scheduler gets null, not a double publish. |
| CallMeBot failure is non-fatal | Post still saves; response carries `whatsappDelivered:false` + `approveUrl` so the widget shows a manual link. A free third-party API can't strand a user's post. Additive fields keep the frozen response shape. |
| Image upload failure is non-fatal | Publish proceeds text-only; an image bug shouldn't eat the post. Logged loudly. |
| Storage convention: public bucket `certificates`, path `{userId}/{postId}.{ext}` | Settles the open question flagged in HANDOFF_0 before schedule-whatsapp was written. |
| OAuth `state` carries the signed return URL | One mechanism gives CSRF protection AND open-redirect protection (origin allowlist: APP_URL + EXTRA_ALLOWED_ORIGINS + localhost). |
| Added `_utils/http.js` (4th util) | Cross-origin embedding means every endpoint needs identical CORS; centralising beats copy-paste in six files. |
| Gemini calls pinned via GEMINI_MODEL env | A model sunset becomes a config change, not a migration. Same for LINKEDIN_VERSION. |
| Batch of 5 per scheduler run | Worst-case LinkedIn round trips fit inside Netlify's 26 s ceiling; the next 15-min tick drains the rest. |

## Schema Change Requests (for the schema owner — DO NOT apply ad hoc)

- `users.callmebot_key TEXT` — CallMeBot keys are bound to the receiving
  phone, so today only the key owner's number gets WhatsApp pings
  (single-user MVP). Multi-user WhatsApp needs a per-user key column.
- `post_queue.failure_reason TEXT` — scheduler currently logs failure causes
  but can't store them; the widget could surface "why did it fail".

## Known Rough Edges

- [ ] **LinkedIn app review**: `w_member_social` requires adding the
      "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect"
      products in the Developer Portal; publishing fails with 403 until then.
- [ ] No rate limiting on analyze/generate — fine while sessions are
      required; revisit before ever enabling ALLOW_ANON_GENERATION in prod.
- [ ] A post stuck in `processing` (crash between claim and mark) needs a
      manual status reset; the failure_reason column above would help triage.
- [ ] LinkedIn token refresh is not implemented — when the 60-day token
      dies, the user reconnects via the widget's auth gate.

## Deployment Runbook (do these in order)

1. **Supabase**: create project → SQL editor: run `001_initial_schema.sql`,
   `002_rls_policies.sql`, then `seed.sql` → Storage: create **public**
   bucket `certificates` → copy URL + service-role key into env.
2. **Gemini**: key from aistudio.google.com → `GEMINI_API_KEY`.
3. **LinkedIn**: create app → add the two products above → set redirect URI
   to `https://<site>.netlify.app/.netlify/functions/callback` → copy id +
   secret into env.
4. **Netlify**: connect the GitHub repo → set ALL env vars from
   `.env.example` → deploy. `APP_URL` = the deployed URL.
5. **CallMeBot** (optional for demo): activate per callmebot.com, set
   `CALLMEBOT_API_KEY`. Skipping it just switches to manual approval links.
6. **Cron**: cron-job.org → POST `https://<site>/.netlify/functions/scheduler`
   every 15 min with header `Authorization: Bearer <SCHEDULER_SECRET>`.
7. **Vortex embed**: hand over one line —
   `<script src="https://<site>.netlify.app/widget/embed.js"></script>`
   (inline variant documented at the top of embed.js). Add the Vortex origin
   to `EXTRA_ALLOWED_ORIGINS`.

## What the Next Session Should Do First

> Local smoke test: `cp .env.example .env`, fill Supabase + Gemini keys, set
> `ALLOW_ANON_GENERATION=true`, run `netlify dev`, open
> `http://localhost:8888/src/widget/?live`, and walk Upload → Questions →
> Preview with a real certificate image. Then configure LinkedIn + deploy.
