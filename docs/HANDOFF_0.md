# HANDOFF_0.md — Phase 0: Database Schema Complete
> Written by: Claude Opus 4.8
> Date: 2026-06-10
> Phase: 0
> Status: Complete

---

## What Was Built

The full database foundation for VISTA: three tables (`users`, `post_queue`,
`questionnaire_responses`), Row Level Security on all of them, a token-based
approval path for the no-session approve flow, and seed data covering every
post status the widget needs to render.

The schema follows `docs/ARCHITECTURE.md` exactly. `post_queue.status` is the
spine of the system — it is a `TEXT` column guarded by a `CHECK` constraint
whose allowed values are the exact strings from `POST_STATUS` in
`src/shared/constants.js`. Nothing can write an out-of-enum status.

Security has three distinct access paths, because VISTA has three kinds of
caller:
1. **The end user** (authenticated via Supabase Auth) — sees only their own
   rows, enforced by `auth.uid()` RLS policies.
2. **The scheduler/cron** — uses the Supabase service-role key, which bypasses
   RLS, so it can move any post through the lifecycle.
3. **The approve link** — has no user session, only a token. It goes through a
   `SECURITY DEFINER` function `approve_post(token, decision)` that validates
   the token, its expiry, and the source status itself.

**This schema is now frozen.** Per `RULES.md` R3, no other phase changes it.
If a later phase needs a column that isn't here, it goes in that phase's
`## Schema Change Requests` and stops — it does not alter these files.

---

## File Map

```
supabase/
  migrations/
    001_initial_schema.sql   — Three tables, CHECK constraint on status,
                               JSONB micro_settings, UNIQUE on approval_token
                               and users.linkedin_id, all indexes.
    002_rls_policies.sql     — Enables RLS on all tables, auth.uid() policies,
                               service_role policy, and the SECURITY DEFINER
                               approve_post() function for the token path.
  seed.sql                   — 1 user + 5 posts (one per renderable status) +
                               5 matching questionnaire_responses rows.
docs/
  HANDOFF_0.md               — This file.
```

---

## Exact Schema (Sonnet: shape your mocks to this)

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` default; equals Supabase `auth.uid()` |
| linkedin_id | TEXT UNIQUE | nullable until OAuth completes |
| access_token | TEXT | encrypted at app layer, stored as plain TEXT here |
| token_expires_at | TIMESTAMPTZ | LinkedIn OAuth window (~60 days) |
| whatsapp_number | TEXT | E.164, e.g. `+919876543210` |
| created_at | TIMESTAMPTZ | `NOT NULL DEFAULT NOW()` |

### `post_queue`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` default |
| user_id | UUID FK → users.id | `NOT NULL`, `ON DELETE CASCADE` |
| post_text | TEXT | generated post content |
| image_url | TEXT | certificate image URL |
| scheduled_at | TIMESTAMPTZ | when to publish |
| status | TEXT | `NOT NULL DEFAULT 'draft'`, CHECK-constrained (see enum below) |
| approval_token | TEXT UNIQUE | one-time WhatsApp token |
| token_expires_at | TIMESTAMPTZ | **approval-token** lifetime (24h) — NOT the LinkedIn token |
| micro_settings | JSONB | `NOT NULL DEFAULT '{}'::jsonb`, holds all 11 settings |
| linkedin_post_id | TEXT | populated after publish |
| created_at | TIMESTAMPTZ | `NOT NULL DEFAULT NOW()` |
| published_at | TIMESTAMPTZ | populated after publish |

### `questionnaire_responses`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` default |
| post_queue_id | UUID FK → post_queue.id | `NOT NULL`, `ON DELETE CASCADE` |
| questions | JSONB | `DEFAULT '[]'`, array of 5 strings |
| answers | JSONB | `DEFAULT '[]'`, array of 5 strings, index-matched to questions |
| created_at | TIMESTAMPTZ | `NOT NULL DEFAULT NOW()` |

---

## The `status` enum (exact strings)

```
draft → pending_approval → approved → processing → published
                         ↘ rejected            ↘ failed
```

Allowed values, verbatim (match `POST_STATUS` in constants.js):
`draft`, `pending_approval`, `approved`, `rejected`, `processing`,
`published`, `failed`.

---

## PostgreSQL-specific behaviour the other AIs must know

| Thing | What to know |
|-------|--------------|
| `status` is a CHECK, not a native ENUM | Writing any string outside the 7 allowed values raises a constraint error. There is no `ALTER TYPE` to worry about, but you also can't add a new status without a new migration. |
| Two different `token_expires_at` columns | `users.token_expires_at` = LinkedIn OAuth (~60 days). `post_queue.token_expires_at` = approval link (24h). Don't conflate them. |
| `micro_settings` defaults to `'{}'::jsonb` | A row inserted without settings is still valid. Read it as an object, not null. |
| `users.id` == `auth.uid()` | RLS compares ownership against `auth.uid()`. When you create a user row, its `id` must be the Supabase auth id, not a fresh random UUID. |
| Service role bypasses RLS | The scheduler uses the service-role key and is not blocked by the user policies. Explicit `service_role` policies exist for clarity. |
| `approve_post()` is `SECURITY DEFINER` | The approve path does NOT use a normal RLS policy. Call the RPC; see below. |

---

## For Codex (Phase 2) — how to query and mutate

**Fetch posts due to publish (scheduler.js):**
```sql
SELECT * FROM post_queue
WHERE status = 'approved' AND scheduled_at <= NOW();
```
Then, per `RULES.md`, set each to `'processing'` BEFORE calling LinkedIn so a
retry can't double-publish. On success set `published`, `linkedin_post_id`,
`published_at`; on error set `failed`.

**Process an approve/reject tap (approve.js) — use the RPC, not a raw UPDATE:**
```js
const { data, error } = await supabase.rpc('approve_post', {
  p_token: token,
  p_decision: 'approved', // or 'rejected'
});
// data === 'approved' | 'rejected' on success;
// data === null  → invalid token, already-used post, or expired token.
```
The function only transitions a post that is currently `pending_approval` and
whose `token_expires_at` is still in the future. This makes approval
single-use without extra app-side locking.

All DB access goes through `netlify/functions/_utils/supabaseClient.js` (R5),
using `SUPABASE_SERVICE_ROLE_KEY` for the scheduler and the appropriate key for
the approve RPC.

---

## Environment Variables

No new env vars introduced in Phase 0. The schema relies on what `.env.example`
already lists (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Nothing to add.

---

## Decisions Made

| Decision | Reason |
|----------|--------|
| `status` as a CHECK constraint, not a native `ENUM` type | Keeps the allowed values as plain strings that mirror `constants.js` literally, with no `ALTER TYPE` migration dance. Trade-off: adding a status needs a new migration to widen the CHECK. |
| Token-based approval via a `SECURITY DEFINER` function, not an RLS policy | The approve flow has no `auth.uid()` to compare against, so a normal RLS policy can't express "this token owns this row". The function validates token + expiry + source status in one atomic UPDATE. |
| `approve_post()` only transitions from `pending_approval` and checks `token_expires_at > NOW()` | Makes approval single-use and time-bounded at the DB layer, so a replayed WhatsApp link can't re-approve or approve an already-published post. |
| No UPDATE/DELETE policy on `questionnaire_responses` | Answers are write-once for an MVP; nothing should edit them after creation. |
| Explicit `service_role` policy even though service role bypasses RLS | Defence-in-depth and documentation of intent if bypass behaviour is ever scoped. |
| Added `idx_qr_post_queue_id` (not in the spec list) | The questionnaire is always fetched by owning post; without it that lookup is a seq scan. Pure addition, no contract impact. |

---

## Known Rough Edges

- [ ] `users.linkedin_id` and `access_token` are nullable so a user row can
  exist pre-OAuth. If the flow always creates users post-OAuth, these could be
  tightened to `NOT NULL` later — not a blocker now.
- [ ] Seed `access_token` is an obvious fake string; it will not authenticate
  against LinkedIn. That's intended — seed data is for rendering UI states.

---

## Bugs Found in Other Layers

- None. No other layer has code yet.

---

## Schema Change Requests

- None needed. Schema matches ARCHITECTURE.md in full.

---

## Blockers

- None.

---

## Architectural Concerns (notes for Shivesh, do not act on unilaterally)

- The 11th micro-setting ("Post Hook Style" / a possible additional hook
  control you were considering) is **not** a schema concern — `micro_settings`
  is schemaless JSONB, so adding settings never requires a migration. Add keys
  in `constants.js` freely.
- `image_url` assumes images are stored somewhere and a URL is kept. If you end
  up using Supabase Storage, the bucket/path convention should be decided
  before Codex writes `schedule-whatsapp.js`. Flagging, not acting.

---

## What the Next Phase Should Do First

> Sonnet: before writing any widget code, open `supabase/seed.sql` and read the
> 5 `post_queue` rows. Those are the exact shapes your mock data in
> `src/shared/api.js` should mirror — same `status` strings, same
> `micro_settings` keys, same `questions`/`answers` array structure. Build your
> mocks to match the DB so Codex can swap mocks for real calls in Phase 2
> without you changing a single response shape.

---

## Prompt for the Next AI (paste to Sonnet to start Phase 1)

> You are working on VISTA, a LinkedIn post scheduling agent that extracts
> details from certificate images via Google Gemini, generates personalised
> LinkedIn posts through a 4-step questionnaire flow, and publishes them after
> WhatsApp approval. You are Claude Sonnet 4.6, and your job is **Phase 1: the
> frontend widget**.
>
> Read, in order: `docs/RULES.md`, then `docs/HANDOFF_0.md`, then
> `docs/ARCHITECTURE.md`, then every file already in `src/shared/`. Do not start
> coding until you've read all four.
>
> You own `src/widget/` and `src/shared/`. You do NOT touch `supabase/`
> (frozen) or `netlify/functions/` (Codex's layer).
>
> Build the FAB (floating action button) widget and its 4-step flow —
> Upload → Questions → Preview → Settings — as vanilla JS, embeddable with a
> single `<script>` tag and zero host-page config. All API calls go through the
> stub functions in `src/shared/api.js`, whose response shapes already match the
> database (see HANDOFF_0). CSS uses only the variables defined in
> `widget.css` — no hardcoded hex. The 11 micro-settings and their option lists
> are already enumerated in `src/shared/constants.js`; render the settings step
> from those, don't hardcode them.
>
> Start by making the mock data in `src/shared/api.js` line up with the 5 post
> states in `supabase/seed.sql` so every UI state (draft, pending, approved,
> published, failed, plus loading and error) is renderable. When done, write
> `docs/HANDOFF_1.md` from `docs/HANDOFF_TEMPLATE.md`.
