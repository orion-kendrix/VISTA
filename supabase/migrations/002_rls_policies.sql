-- ============================================================================
-- VISTA — 002_rls_policies.sql
-- Phase 0: Row Level Security (FROZEN once committed)
-- Written by: Claude Opus 4.8
--
-- Access model:
--   * End users (authenticated via Supabase Auth) reach the DB through the
--     anon/authenticated role. They may only see/touch their own rows. These
--     are the auth.uid()-scoped policies below.
--   * The scheduler.js cron function uses the SERVICE ROLE key. The service
--     role BYPASSES RLS entirely in Supabase, so it can update any post_queue
--     row to drive the publish lifecycle. We still add explicit service_role
--     policies for clarity/defence-in-depth in case RLS-bypass is ever scoped.
--   * The approve.js function runs with NO user session — it holds only an
--     approval token from the WhatsApp link. It authenticates the *post*, not a
--     user. That path goes through the SECURITY DEFINER function approve_post()
--     defined at the bottom, NOT through a normal RLS policy, because there is
--     no auth.uid() to compare against.
--
-- IMPORTANT: A SECURITY DEFINER function runs with the privileges of its owner
-- (the table owner), so it can update post_queue even though the caller has no
-- rights. The function body is the security boundary — it must validate the
-- token, its expiry, and the source status itself. Do not loosen it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS on all three tables
-- ----------------------------------------------------------------------------
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_queue              ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- users — a user only ever sees/edits their own row (id == auth.uid())
-- ----------------------------------------------------------------------------
CREATE POLICY users_select_own ON users
    FOR SELECT
    USING (id = auth.uid());

CREATE POLICY users_insert_own ON users
    FOR INSERT
    WITH CHECK (id = auth.uid());

CREATE POLICY users_update_own ON users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- post_queue — scoped to posts the user owns (user_id == auth.uid())
-- ----------------------------------------------------------------------------
CREATE POLICY post_queue_select_own ON post_queue
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY post_queue_insert_own ON post_queue
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY post_queue_update_own ON post_queue
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Explicit service-role policy for the scheduler/cron publisher. The service
-- role already bypasses RLS, but this documents intent and survives any future
-- tightening of bypass behaviour.
CREATE POLICY post_queue_service_all ON post_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- questionnaire_responses — readable/insertable only when the owning post
-- belongs to the current user. No UPDATE policy: answers are write-once.
-- ----------------------------------------------------------------------------
CREATE POLICY qr_select_via_owned_post ON questionnaire_responses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM post_queue p
            WHERE p.id = questionnaire_responses.post_queue_id
              AND p.user_id = auth.uid()
        )
    );

CREATE POLICY qr_insert_via_owned_post ON questionnaire_responses
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM post_queue p
            WHERE p.id = questionnaire_responses.post_queue_id
              AND p.user_id = auth.uid()
        )
    );

-- ============================================================================
-- Token-based approval path (no user session)
--
-- approve_post(token, decision) is the ONLY way the approve.js function should
-- mutate a post's status. It is SECURITY DEFINER so it runs with owner rights
-- and does its own validation:
--   * token must match an existing post
--   * post must currently be 'pending_approval' (can't approve twice / approve
--     a published or rejected post)
--   * token must not be expired (token_expires_at > NOW())
--   * decision must be exactly 'approved' or 'rejected'
-- Returns the new status, or NULL if the token was invalid/expired/used.
-- ============================================================================
CREATE OR REPLACE FUNCTION approve_post(p_token TEXT, p_decision TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_status TEXT;
BEGIN
    -- Only these two transitions are legal from this entry point.
    IF p_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'invalid decision: %', p_decision;
    END IF;

    UPDATE post_queue
       SET status = p_decision
     WHERE approval_token = p_token
       AND status = 'pending_approval'
       AND token_expires_at IS NOT NULL
       AND token_expires_at > NOW()
    RETURNING status INTO v_new_status;

    -- v_new_status is NULL when nothing matched: bad token, wrong source
    -- status (already used), or expired token. Caller treats NULL as failure.
    RETURN v_new_status;
END;
$$;

-- The approve function calls this RPC via the anon role. Grant execution to the
-- roles your Netlify function will actually use. (anon covers the no-session
-- case; service_role is included for completeness.)
GRANT EXECUTE ON FUNCTION approve_post(TEXT, TEXT) TO anon, authenticated, service_role;
