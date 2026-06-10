-- ============================================================================
-- VISTA — seed.sql
-- Phase 0: Test data covering every UI state the widget must render
-- Written by: Claude Opus 4.8
--
-- Run AFTER 001_initial_schema.sql and 002_rls_policies.sql.
-- Inserts run as the table owner (e.g. via `supabase db reset` / psql), so RLS
-- does not block these writes. Do NOT rely on this data in production.
--
-- Fixed UUIDs are used so other layers (Sonnet's mocks, Codex's tests) can
-- reference known ids. The single seed user owns all posts below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 user with a valid (non-expired) LinkedIn token
-- ----------------------------------------------------------------------------
INSERT INTO users (id, linkedin_id, access_token, token_expires_at, whatsapp_number)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'linkedin-member-abc123',
    'SEED_FAKE_ACCESS_TOKEN_do_not_use',
    NOW() + INTERVAL '60 days',
    '+919876543210'
);

-- ----------------------------------------------------------------------------
-- post_queue — one row per status the UI needs to render
-- micro_settings mirrors MICRO_SETTINGS_DEFAULTS from src/shared/constants.js.
-- ----------------------------------------------------------------------------

-- draft: created, not yet sent for approval
INSERT INTO post_queue
    (id, user_id, post_text, image_url, scheduled_at, status,
     approval_token, token_expires_at, micro_settings)
VALUES (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000001',
    'Draft post about earning my AWS Solutions Architect certification.',
    'https://example.com/certs/aws-saa.jpg',
    NOW() + INTERVAL '2 days',
    'draft',
    NULL,
    NULL,
    '{"tone":"professional","length":"medium","industry":"","language":"english","emojiDensity":"low","hookStyle":"boldStatement","hashtagCount":5,"callToAction":true,"credentialFocus":"skills","audienceTarget":"general","firstPerson":true}'::jsonb
);

-- pending_approval: WhatsApp sent, awaiting tap. Has a live token.
INSERT INTO post_queue
    (id, user_id, post_text, image_url, scheduled_at, status,
     approval_token, token_expires_at, micro_settings)
VALUES (
    '00000000-0000-0000-0000-0000000000a2',
    '00000000-0000-0000-0000-000000000001',
    'Pending post about completing the Google Data Analytics certificate.',
    'https://example.com/certs/google-da.jpg',
    NOW() + INTERVAL '1 day',
    'pending_approval',
    'seed-token-pending-0001',
    NOW() + INTERVAL '24 hours',
    '{"tone":"inspirational","length":"long","industry":"Analytics","language":"english","emojiDensity":"medium","hookStyle":"question","hashtagCount":7,"callToAction":true,"credentialFocus":"journey","audienceTarget":"peers","firstPerson":true}'::jsonb
);

-- approved: user tapped Approve, waiting for the scheduler to pick it up
INSERT INTO post_queue
    (id, user_id, post_text, image_url, scheduled_at, status,
     approval_token, token_expires_at, micro_settings)
VALUES (
    '00000000-0000-0000-0000-0000000000a3',
    '00000000-0000-0000-0000-000000000001',
    'Approved post about passing the CKA (Certified Kubernetes Administrator) exam.',
    'https://example.com/certs/cka.jpg',
    NOW() + INTERVAL '3 hours',
    'approved',
    'seed-token-approved-0002',
    NOW() + INTERVAL '24 hours',
    '{"tone":"professional","length":"short","industry":"DevOps","language":"english","emojiDensity":"none","hookStyle":"statistic","hashtagCount":4,"callToAction":false,"credentialFocus":"skills","audienceTarget":"recruiters","firstPerson":true}'::jsonb
);

-- published: successfully posted to LinkedIn
INSERT INTO post_queue
    (id, user_id, post_text, image_url, scheduled_at, status,
     approval_token, token_expires_at, micro_settings,
     linkedin_post_id, published_at)
VALUES (
    '00000000-0000-0000-0000-0000000000a4',
    '00000000-0000-0000-0000-000000000001',
    'Published post celebrating my PMP certification.',
    'https://example.com/certs/pmp.jpg',
    NOW() - INTERVAL '1 day',
    'published',
    'seed-token-published-0003',
    NOW() - INTERVAL '12 hours',
    '{"tone":"humble","length":"medium","industry":"Project Management","language":"english","emojiDensity":"low","hookStyle":"storyOpener","hashtagCount":6,"callToAction":true,"credentialFocus":"gratitude","audienceTarget":"general","firstPerson":true}'::jsonb,
    'urn:li:share:seed1234567890',
    NOW() - INTERVAL '23 hours'
);

-- failed: scheduler attempted publish, LinkedIn API errored
INSERT INTO post_queue
    (id, user_id, post_text, image_url, scheduled_at, status,
     approval_token, token_expires_at, micro_settings)
VALUES (
    '00000000-0000-0000-0000-0000000000a5',
    '00000000-0000-0000-0000-000000000001',
    'Failed post about earning the Azure Fundamentals certification.',
    'https://example.com/certs/azure-fund.jpg',
    NOW() - INTERVAL '2 hours',
    'failed',
    'seed-token-failed-0004',
    NOW() - INTERVAL '1 hour',
    '{"tone":"casual","length":"short","industry":"Cloud","language":"hinglish","emojiDensity":"high","hookStyle":"boldStatement","hashtagCount":3,"callToAction":true,"credentialFocus":"impact","audienceTarget":"clients","firstPerson":true}'::jsonb
);

-- ----------------------------------------------------------------------------
-- questionnaire_responses — one row per post above (index-matched arrays)
-- ----------------------------------------------------------------------------
INSERT INTO questionnaire_responses (post_queue_id, questions, answers)
VALUES
(
    '00000000-0000-0000-0000-0000000000a1',
    '["What specific skills did you develop?","How long did you prepare?","How does this align with your goals?","What advice for future candidates?","What do you wish you had known?"]'::jsonb,
    '["Cloud architecture and IAM design.","About three months.","Core to my move into cloud engineering.","Start before you feel ready.","How much hands-on practice matters."]'::jsonb
),
(
    '00000000-0000-0000-0000-0000000000a2',
    '["What specific skills did you develop?","How long did you prepare?","How does this align with your goals?","What advice for future candidates?","What do you wish you had known?"]'::jsonb,
    '["SQL, data cleaning, and visualization.","Six months part-time.","It anchors my analytics career pivot.","Build a portfolio as you learn.","SQL fundamentals carry the whole thing."]'::jsonb
),
(
    '00000000-0000-0000-0000-0000000000a3',
    '["What specific skills did you develop?","How long did you prepare?","How does this align with your goals?","What advice for future candidates?","What do you wish you had known?"]'::jsonb,
    '["Cluster ops, networking, troubleshooting.","Two intense months.","Directly supports my platform role.","Practice in a real cluster, not slides.","kubectl muscle memory is everything."]'::jsonb
),
(
    '00000000-0000-0000-0000-0000000000a4',
    '["What specific skills did you develop?","How long did you prepare?","How does this align with your goals?","What advice for future candidates?","What do you wish you had known?"]'::jsonb,
    '["Stakeholder and risk management.","Four months.","Formalizes years of delivery work.","Lean on real project examples.","The exam rewards process discipline."]'::jsonb
),
(
    '00000000-0000-0000-0000-0000000000a5',
    '["What specific skills did you develop?","How long did you prepare?","How does this align with your goals?","What advice for future candidates?","What do you wish you had known?"]'::jsonb,
    '["Core Azure services and pricing.","Three weeks.","A first step into cloud.","Use the free sandbox heavily.","Fundamentals is broad but shallow."]'::jsonb
);
