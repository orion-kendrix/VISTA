# Antigravity Prompt — Claude Opus 4.8
# Phase 0: Database Schema
# Copy everything below this line and paste it as your first message in Antigravity.

---

You are working on **VISTA**, a LinkedIn post scheduling agent that uses Google Gemini to extract details from certificate images, generates personalised LinkedIn posts, and publishes them after WhatsApp-based approval.

You are **Claude Opus 4.8** operating in **Antigravity**.
Your job is **Phase 0: Database Schema**.

---

## Your first action

Before writing any SQL, read these three documents in this exact order:
1. `docs/RULES.md`
2. `docs/ARCHITECTURE.md`
3. `src/shared/constants.js`

They are already in the project. Everything you need to know about table structure, column names, status enums, and constraints is documented there.

---

## What you must produce

### 1. `supabase/migrations/001_initial_schema.sql`

Create all three tables exactly as specified in `docs/ARCHITECTURE.md`:
- `users`
- `post_queue`
- `questionnaire_responses`

Requirements:
- Every table gets `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- Every table gets `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- All foreign keys must have explicit `ON DELETE CASCADE`
- `post_queue.status` must be implemented as a PostgreSQL `CHECK` constraint using the exact string values from `POST_STATUS` in `src/shared/constants.js`: `draft`, `pending_approval`, `approved`, `rejected`, `processing`, `published`, `failed`
- `post_queue.micro_settings` is a `JSONB` column with a default of `'{}'::jsonb`
- `post_queue.approval_token` must have a `UNIQUE` constraint
- `users.linkedin_id` must have a `UNIQUE` constraint
- `users.access_token` must be stored as `TEXT` — encryption is handled at the application layer
- Add appropriate indexes: `post_queue(user_id)`, `post_queue(status)`, `post_queue(scheduled_at)`, `post_queue(approval_token)`, `users(linkedin_id)`

### 2. `supabase/migrations/002_rls_policies.sql`

Enable Row Level Security on all three tables and write policies so:
- A user can only `SELECT`, `INSERT`, `UPDATE` their own rows in `users`
- A user can only `SELECT`, `INSERT`, `UPDATE` rows in `post_queue` where `user_id = auth.uid()`
- A user can only `SELECT`, `INSERT` rows in `questionnaire_responses` where `post_queue_id` belongs to a post they own
- The `scheduler` service role can `UPDATE` `post_queue.status` on any row (needed for the cron publisher)
- The `approve` function (which runs without user auth, using only a token) can `UPDATE` `post_queue.status` where `approval_token` matches — implement this carefully as a security definer function or a separate policy for the service role

### 3. `supabase/seed.sql`

Write seed data that covers every UI state the widget needs to render:
- 1 user with a valid token
- 1 post in `draft` status
- 1 post in `pending_approval` status
- 1 post in `approved` status
- 1 post in `published` status
- 1 post in `failed` status
- Corresponding `questionnaire_responses` rows for each post

---

## What you must NOT do

- Do not touch anything in `src/widget/` — that is Sonnet's layer
- Do not touch anything in `netlify/functions/` — that is Codex's layer
- Do not create any new files outside `supabase/` except `docs/HANDOFF_0.md`
- Do not change `src/shared/constants.js` — if you need a status value that isn't there, flag it in HANDOFF_0.md

---

## After the schema is complete

Write `docs/HANDOFF_0.md` using the template at `docs/HANDOFF_TEMPLATE.md`.

Your handoff document must include:
- The exact column names and types for every table (Sonnet needs these to shape mock data correctly)
- Any PostgreSQL-specific behaviour the other AIs need to know about (e.g. how the status CHECK constraint works)
- The exact string values for the `status` enum
- Instructions for how Codex should query `post_queue` for due posts (hint: `WHERE status = 'approved' AND scheduled_at <= NOW()`)
- A ready-to-paste prompt for Sonnet to start Phase 1

---

## Critical context

- This schema is **frozen** the moment you write it. All other phases build against it.
- Codex will query it using the Supabase JS client via `supabaseClient.js`
- The `post_queue.status` field drives the entire post lifecycle state machine — get it right
- LinkedIn OAuth tokens last approximately 60 days — `token_expires_at` is critical for the scheduler to skip users with expired tokens rather than failing silently

Start by reading the three documents listed above, then write the SQL.
