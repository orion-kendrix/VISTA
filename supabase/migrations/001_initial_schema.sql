-- ============================================================================
-- VISTA — 001_initial_schema.sql
-- Phase 0: Database Schema (FROZEN once committed)
-- Written by: Claude Opus 4.8
--
-- Source of truth: docs/ARCHITECTURE.md (Database Schema section)
--                  src/shared/constants.js (POST_STATUS enum)
--
-- Notes:
--   * gen_random_uuid() requires pgcrypto (built into Supabase by default).
--   * users.id mirrors the Supabase auth user id (auth.uid()). RLS in 002
--     compares user-owned rows against auth.uid(), so users.id IS the auth id.
--   * post_queue.status is enforced with a CHECK constraint rather than a
--     native ENUM type so the allowed values stay in lockstep with the string
--     literals in src/shared/constants.js without a migration to ALTER TYPE.
-- ============================================================================

-- pgcrypto powers gen_random_uuid(). Safe no-op if already present on Supabase.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- users
-- One row per authenticated LinkedIn user. id == Supabase auth.uid().
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    linkedin_id       TEXT         UNIQUE,
    -- LinkedIn OAuth access token. Stored as TEXT; encryption is handled at the
    -- application layer (tokenSecurity.js), NOT in the database.
    access_token      TEXT,
    -- LinkedIn tokens last ~60 days. The scheduler reads this to skip users
    -- with expired tokens rather than failing the publish silently.
    token_expires_at  TIMESTAMPTZ,
    whatsapp_number   TEXT,        -- E.164 format, e.g. +919876543210
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- post_queue
-- The post lifecycle table. status drives the entire state machine.
-- ----------------------------------------------------------------------------
CREATE TABLE post_queue (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_text         TEXT,        -- Generated LinkedIn post content
    image_url         TEXT,        -- Stored certificate image URL
    scheduled_at      TIMESTAMPTZ, -- When to publish

    -- Lifecycle status. Exact string values mirror POST_STATUS in
    -- src/shared/constants.js. Any new status MUST be added there first AND
    -- here via a new migration — never widen this CHECK ad hoc.
    status            TEXT         NOT NULL DEFAULT 'draft'
                                   CHECK (status IN (
                                       'draft',
                                       'pending_approval',
                                       'approved',
                                       'rejected',
                                       'processing',
                                       'published',
                                       'failed'
                                   )),

    -- One-time WhatsApp approval token. UNIQUE so the token lookup in the
    -- approve function resolves to exactly one row.
    approval_token    TEXT         UNIQUE,
    -- Approval-token lifetime (24h from creation, set by the app layer).
    -- Distinct from users.token_expires_at, which is the LinkedIn OAuth window.
    token_expires_at  TIMESTAMPTZ,

    -- All 11 micro-settings as a JSON object. Defaults to empty object so a row
    -- created without settings is still valid JSONB.
    micro_settings    JSONB        NOT NULL DEFAULT '{}'::jsonb,

    linkedin_post_id  TEXT,        -- Populated after a successful publish
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    published_at      TIMESTAMPTZ  -- Populated after a successful publish
);

-- ----------------------------------------------------------------------------
-- questionnaire_responses
-- The 5 questions + 5 index-matched answers for a given post.
-- ----------------------------------------------------------------------------
CREATE TABLE questionnaire_responses (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    post_queue_id     UUID         NOT NULL REFERENCES post_queue(id) ON DELETE CASCADE,
    questions         JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- array of 5 strings
    answers           JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- array of 5 strings, index-matched
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
-- Hot path: "all posts for this user" (widget list, RLS-scoped queries).
CREATE INDEX idx_post_queue_user_id        ON post_queue (user_id);
-- Hot path: scheduler filters by status ('approved') every cron tick.
CREATE INDEX idx_post_queue_status         ON post_queue (status);
-- Hot path: scheduler orders/filters due posts by scheduled_at.
CREATE INDEX idx_post_queue_scheduled_at   ON post_queue (scheduled_at);
-- Hot path: approve function looks a post up by its token.
CREATE INDEX idx_post_queue_approval_token ON post_queue (approval_token);
-- Hot path: OAuth callback resolves an existing user by linkedin_id.
CREATE INDEX idx_users_linkedin_id         ON users (linkedin_id);
-- Helper: questionnaire fetch by owning post.
CREATE INDEX idx_qr_post_queue_id          ON questionnaire_responses (post_queue_id);
