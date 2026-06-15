// netlify/functions/schedule-whatsapp.js
// POST (session required) → saves the post as pending_approval, stores the
// certificate image, generates the one-shot approval token, and pings the
// user's WhatsApp via CallMeBot with Approve/Reject links.
//
// Resilience decision (documented in HANDOFF_2): if CallMeBot is missing or
// down, the post is STILL saved and the response carries
// { whatsappDelivered:false, approveUrl } so the widget can show a manual
// approval link — the user is never stuck because a free third-party API
// hiccuped. The frozen { postQueueId, status } shape is preserved; the extra
// fields are additive.

import { preflight, json, readJson } from './_utils/http.js';
import { requireSession, randomToken } from './_utils/tokenSecurity.js';
import {
  insertPost, insertQuestionnaire, setPostImageUrl,
  updateUserWhatsapp, uploadCertificateImage,
} from './_utils/supabaseClient.js';
import { sendApprovalEmail, emailConfigured } from './_utils/emailClient.js';

export default async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json(405, { error: 'POST only' }, req);

  try {
    const { userId } = requireSession(req);
    const p = await readJson(req);

    // ── Validation (fail fast, fail loud) ───────────────────────────────────
    if (!p.postText?.trim()) return json(400, { error: 'postText is required' }, req);
    if (p.postText.length > 3000) return json(400, { error: 'Post exceeds LinkedIn\'s 3000 character limit' }, req);
    // Email is the primary approval channel; WhatsApp is optional/legacy. Both
    // are validated only when present — if neither is given, the response still
    // carries the manual approveUrl so the user is never stranded.
    const email = (p.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: 'email must be a valid address' }, req);
    }
    if (p.whatsappNumber && !/^\+\d{8,15}$/.test(p.whatsappNumber)) {
      return json(400, { error: 'whatsappNumber must be E.164, e.g. +919876543210' }, req);
    }
    const scheduledAt = new Date(p.scheduledAt);
    if (isNaN(scheduledAt) || scheduledAt < new Date()) {
      return json(400, { error: 'scheduledAt must be a valid future datetime' }, req);
    }

    // ── Persist ─────────────────────────────────────────────────────────────
    if (p.whatsappNumber) await updateUserWhatsapp(userId, p.whatsappNumber);

    const approvalToken = randomToken();
    const ttlHours = Number(process.env.TOKEN_EXPIRY_HOURS) || 24;

    const post = await insertPost({
      userId,
      postText: p.postText,
      scheduledAt: scheduledAt.toISOString(),
      microSettings: p.microSettings || {},
      approvalToken,
      tokenExpiresAt: new Date(Date.now() + ttlHours * 3600 * 1000).toISOString(),
      status: 'pending_approval',
    });

    let imageUrl = null;
    if (p.imageBase64) {
      try {
        imageUrl = await uploadCertificateImage(
          userId, post.id, p.imageBase64, p.imageMimeType || 'image/jpeg'
        );
        await setPostImageUrl(post.id, imageUrl);
      } catch (err) {
        // Image storage failing should not lose the post — publish can go text-only.
        console.error('[schedule-whatsapp] image upload failed (continuing):', err);
      }
    }

    await insertQuestionnaire(
      post.id,
      Array.isArray(p.questions) ? p.questions : [],
      Array.isArray(p.answers) ? p.answers : []
    );

    // ── Notify ──────────────────────────────────────────────────────────────
    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const approveUrl = `${appUrl}/.netlify/functions/approve?token=${approvalToken}&decision=approved`;
    const rejectUrl = `${appUrl}/.netlify/functions/approve?token=${approvalToken}&decision=rejected`;

    // Email — the primary approval channel.
    let emailDelivered = false;
    if (email && emailConfigured()) {
      try {
        await sendApprovalEmail({ to: email, postText: p.postText, scheduledAt, imageUrl, approveUrl, rejectUrl, ttlHours });
        emailDelivered = true;
      } catch (err) {
        console.error('[schedule-whatsapp] approval email failed:', err);
      }
    } else if (email && !emailConfigured()) {
      console.warn('[schedule-whatsapp] email given but BREVO_API_KEY/EMAIL_FROM not set — skipping email send');
    }

    // WhatsApp — optional legacy channel, only when a number AND a key exist.
    let whatsappDelivered = false;
    if (p.whatsappNumber && process.env.CALLMEBOT_API_KEY) {
      try {
        await sendCallMeBot(p.whatsappNumber, buildMessage(p.postText, scheduledAt, imageUrl, approveUrl, rejectUrl, ttlHours));
        whatsappDelivered = true;
      } catch (err) {
        console.error('[schedule-whatsapp] CallMeBot send failed:', err);
      }
    }

    return json(200, {
      postQueueId: post.id,
      status: 'pending_approval',
      emailDelivered,
      whatsappDelivered,
      // Always return the manual link so the user can approve even if every
      // delivery channel was unavailable.
      approveUrl,
    }, req);
  } catch (err) {
    if (err.status) return json(err.status, { error: err.message }, req);
    console.error('[schedule-whatsapp] failed:', err);
    return json(500, { error: 'Could not save the post — please retry' }, req);
  }
};

// ── helpers ──────────────────────────────────────────────────────────────────

function buildMessage(postText, scheduledAt, imageUrl, approveUrl, rejectUrl, ttlHours) {
  const when = scheduledAt.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
  return [
    '🎯 *VISTA* — post awaiting your approval',
    '',
    `"${postText.slice(0, 180)}${postText.length > 180 ? '…' : ''}"`,
    '',
    `🗓 Scheduled: ${when} IST`,
    imageUrl ? `🖼 ${imageUrl}` : null,
    '',
    `✅ Approve: ${approveUrl}`,
    `❌ Reject: ${rejectUrl}`,
    '',
    `Links expire in ${ttlHours}h.`,
  ].filter((l) => l !== null).join('\n');
}

async function sendCallMeBot(phone, text) {
  const url =
    'https://api.callmebot.com/whatsapp.php' +
    `?phone=${encodeURIComponent(phone)}` +
    `&text=${encodeURIComponent(text)}` +
    `&apikey=${encodeURIComponent(process.env.CALLMEBOT_API_KEY)}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok || /error/i.test(body)) {
    throw new Error(`CallMeBot responded ${res.status}: ${body.slice(0, 200)}`);
  }
}
