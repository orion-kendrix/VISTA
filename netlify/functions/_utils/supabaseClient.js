// netlify/functions/_utils/supabaseClient.js
// ALL Supabase access for every function lives here (RULES.md: no function
// file talks to the DB directly). Uses the SERVICE ROLE key, which bypasses
// RLS — these helpers run server-side only and must never be imported by
// widget code.

import { createClient } from '@supabase/supabase-js';

let _client = null;
export function getClient() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    }
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

const BUCKET = () => process.env.SUPABASE_STORAGE_BUCKET || 'certificates';

// Wraps every query so failures carry table + operation context (R8).
function check({ data, error }, what) {
  if (error) throw new Error(`[supabase] ${what}: ${error.message}`);
  return data;
}

// ── users ────────────────────────────────────────────────────────────────────

/** OAuth callback path: create-or-refresh the user row keyed on linkedin_id. */
export async function upsertUserFromLinkedIn({ linkedinId, accessToken, tokenExpiresAt }) {
  const res = await getClient()
    .from('users')
    .upsert(
      { linkedin_id: linkedinId, access_token: accessToken, token_expires_at: tokenExpiresAt },
      { onConflict: 'linkedin_id' }
    )
    .select()
    .single();
  return check(res, 'upsert user');
}

export async function getUser(userId) {
  const res = await getClient().from('users').select('*').eq('id', userId).single();
  return check(res, `get user ${userId}`);
}

export async function updateUserWhatsapp(userId, whatsappNumber) {
  const res = await getClient()
    .from('users')
    .update({ whatsapp_number: whatsappNumber })
    .eq('id', userId)
    .select()
    .single();
  return check(res, 'update whatsapp number');
}

// ── post_queue ───────────────────────────────────────────────────────────────

export async function insertPost({ userId, postText, scheduledAt, microSettings, approvalToken, tokenExpiresAt, status }) {
  const res = await getClient()
    .from('post_queue')
    .insert({
      user_id: userId,
      post_text: postText,
      scheduled_at: scheduledAt,
      micro_settings: microSettings,
      approval_token: approvalToken,
      token_expires_at: tokenExpiresAt,
      status,
    })
    .select()
    .single();
  return check(res, 'insert post');
}

export async function setPostImageUrl(postId, imageUrl) {
  const res = await getClient()
    .from('post_queue')
    .update({ image_url: imageUrl })
    .eq('id', postId)
    .select()
    .single();
  return check(res, 'set image_url');
}

/** Scheduler read: approved posts whose time has come. */
export async function getDuePosts(limit = 5) {
  const res = await getClient()
    .from('post_queue')
    .select('*')
    .eq('status', 'approved')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit);
  return check(res, 'get due posts');
}

/**
 * Widget "My Posts" read: a user's own posts, newest first. Selects only
 * display-safe columns (never access_token or approval_token) and is always
 * scoped to one user_id, so a session can only ever see its owner's history.
 */
export async function listPostsByUser(userId, limit = 25) {
  const res = await getClient()
    .from('post_queue')
    .select('id, post_text, status, scheduled_at, published_at, linkedin_post_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return check(res, 'list posts by user');
}

/** approve.js read: fetch a post by its approval token for publish-on-approval. */
export async function getPostByApprovalToken(token) {
  const res = await getClient()
    .from('post_queue')
    .select('*')
    .eq('approval_token', token)
    .limit(1);
  const rows = check(res, 'get post by approval token');
  return rows?.[0] ?? null;
}

/**
 * Atomically claim a post for publishing: approved → processing.
 * The .eq('status','approved') guard means a concurrent/retried scheduler run
 * gets back null instead of double-publishing (RULES.md scheduler rule).
 */
export async function claimPost(postId) {
  const res = await getClient()
    .from('post_queue')
    .update({ status: 'processing' })
    .eq('id', postId)
    .eq('status', 'approved')
    .select();
  const rows = check(res, `claim post ${postId}`);
  return rows?.[0] ?? null;
}

export async function markPublished(postId, linkedinPostId) {
  const res = await getClient()
    .from('post_queue')
    .update({
      status: 'published',
      linkedin_post_id: linkedinPostId,
      published_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .select()
    .single();
  return check(res, `mark published ${postId}`);
}

export async function markFailed(postId) {
  const res = await getClient()
    .from('post_queue')
    .update({ status: 'failed' })
    .eq('id', postId)
    .select()
    .single();
  return check(res, `mark failed ${postId}`);
}

// ── questionnaire_responses ─────────────────────────────────────────────────

export async function insertQuestionnaire(postQueueId, questions, answers) {
  const res = await getClient()
    .from('questionnaire_responses')
    .insert({ post_queue_id: postQueueId, questions, answers })
    .select()
    .single();
  return check(res, 'insert questionnaire');
}

// ── storage ──────────────────────────────────────────────────────────────────

/**
 * Stores the certificate image and returns its public URL.
 * Convention (flagged in HANDOFF_0 as an open decision, settled here):
 * bucket `certificates` (public), path `{userId}/{postId}.{ext}`.
 */
export async function uploadCertificateImage(userId, postId, base64, mimeType) {
  const ext =
    mimeType === 'application/pdf' ? 'pdf'
    : (mimeType?.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${userId}/${postId}.${ext}`;

  const { error } = await getClient()
    .storage.from(BUCKET())
    .upload(path, Buffer.from(base64, 'base64'), { contentType: mimeType, upsert: true });
  if (error) throw new Error(`[supabase] storage upload: ${error.message}`);

  const { data } = getClient().storage.from(BUCKET()).getPublicUrl(path);
  return data.publicUrl;
}
