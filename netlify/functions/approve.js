// netlify/functions/approve.js
// GET ?token=…&decision=approved|rejected — the link tapped on WhatsApp.
// Per HANDOFF_0 this NEVER updates post_queue directly: all validation
// (token match, pending_approval source state, expiry) lives inside the
// SECURITY DEFINER approve_post() function from 002_rls_policies.sql, which
// makes the link single-use at the database layer.

import {
  getClient, getPostByApprovalToken, claimPost, getUser, markPublished, markFailed,
} from './_utils/supabaseClient.js';
import { publishPost } from './_utils/linkedinClient.js';
import { html } from './_utils/http.js';

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const raw = (url.searchParams.get('decision') || '').toLowerCase();
  const decision = raw.startsWith('approv') ? 'approved'
                 : raw.startsWith('reject') ? 'rejected'
                 : null;

  if (!token || !decision) {
    return html(400, page('🤔', 'Invalid link', 'This approval link is malformed. Open the exact link from WhatsApp.'));
  }

  try {
    const { data, error } = await getClient().rpc('approve_post', {
      p_token: token,
      p_decision: decision,
    });

    if (error) {
      console.error('[approve] RPC error:', error);
      return html(500, page('⚠️', 'Something went wrong', 'Please try the link again in a moment.'));
    }

    // NULL from the RPC = bad token, already used, or expired (by design).
    if (!data) {
      return html(410, page('⏰', 'Link expired or already used',
        'Approval links work once and expire after 24 hours. Schedule the post again from VISTA if needed.'));
    }

    if (data === 'rejected') {
      return html(200, page('🗑️', 'Post rejected', 'Nothing will be published. You can close this tab.'));
    }

    // Publish-on-approval: if the scheduled time has already passed, publish
    // NOW instead of waiting up to 30 min for the cron. Best-effort — any
    // failure here is logged and the cron remains the backstop.
    const outcome = await maybePublishNow(token).catch((err) => {
      console.error('[approve] immediate publish error (cron will retry):', err);
      return 'scheduled';
    });

    return outcome === 'published'
      ? html(200, page('🚀', 'Posted to LinkedIn!',
          'Your post is live on your feed right now. You can close this tab.'))
      : html(200, page('✅', 'Post approved!',
          'VISTA will publish it to LinkedIn at the scheduled time. You can close this tab.'));
  } catch (err) {
    console.error('[approve] failed:', err);
    return html(500, page('⚠️', 'Something went wrong', 'Please try the link again in a moment.'));
  }
};

/**
 * If the just-approved post is already due (scheduled_at ≤ now), claim and
 * publish it immediately so "post now" is instant. Future-scheduled posts are
 * left for the cron. Returns 'published' | 'scheduled' | 'failed'.
 */
async function maybePublishNow(token) {
  const post = await getPostByApprovalToken(token);
  if (!post || new Date(post.scheduled_at) > new Date()) return 'scheduled';

  // Status guard (approved → processing) prevents a double publish if the cron
  // grabs the same post at the same moment.
  const claimed = await claimPost(post.id);
  if (!claimed) return 'scheduled';

  try {
    const user = await getUser(post.user_id);
    const tokenDead =
      !user?.access_token ||
      (user.token_expires_at && new Date(user.token_expires_at) < new Date());
    if (tokenDead) {
      await markFailed(post.id);
      return 'failed';
    }
    const linkedinPostId = await publishPost({
      accessToken: user.access_token,
      personUrn: `urn:li:person:${user.linkedin_id}`,
      text: post.post_text,
      imageUrl: post.image_url,
    });
    await markPublished(post.id, linkedinPostId);
    return 'published';
  } catch (err) {
    console.error(`[approve] publish failed for ${post.id}:`, err);
    try { await markFailed(post.id); } catch { /* leave for manual triage */ }
    return 'failed';
  }
}

// Self-contained dark page matching the VISTA/Vortex theme — opened from
// WhatsApp's in-app browser, so it must need zero external assets.
function page(emoji, title, body) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>VISTA — ${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;
       background:#0a0a14;color:#f1f5f9;text-align:center;padding:24px;
       background-image:radial-gradient(ellipse 80% 50% at 50% -20%,rgba(124,58,237,.16),transparent)}
  .card{max-width:380px;border:1px solid rgba(255,255,255,.1);border-radius:18px;
        padding:36px 28px;background:rgba(17,17,31,.85)}
  .emoji{font-size:52px;margin-bottom:14px}
  h1{font-size:20px;margin:0 0 10px}
  p{font-size:14px;line-height:1.6;color:#8b93a7;margin:0}
  .brand{margin-top:22px;font-size:11px;letter-spacing:.18em;color:#475069}
  .brand b{color:#a78bfa}
</style></head>
<body><div class="card">
  <div class="emoji">${emoji}</div>
  <h1>${title}</h1>
  <p>${body}</p>
  <div class="brand">POWERED BY <b>VISTA</b></div>
</div></body></html>`;
}
