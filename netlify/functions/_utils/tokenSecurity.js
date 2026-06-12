// netlify/functions/_utils/tokenSecurity.js
// Token generation + validation. Two distinct token types live here:
//   1. Approval tokens  — random one-shot strings stored in post_queue;
//      the DB function approve_post() is the validator (see 002_rls_policies).
//   2. Session tokens   — stateless HMAC-signed payloads identifying the
//      user between the OAuth callback and later function calls. Stateless
//      because Netlify functions share no memory and we don't want a
//      sessions table (schema is frozen).

import crypto from 'node:crypto';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    // Fail loudly at use-time, not import-time, so cold starts of unrelated
    // functions don't crash when only this env var is missing.
    throw new Error('SESSION_SECRET env var is not set — add it in Netlify env settings');
  }
  return s;
}

const hmac = (data) =>
  crypto.createHmac('sha256', secret()).update(data).digest('base64url');

/** Random hex token for WhatsApp approval links (single-use, validated in DB). */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Sign an arbitrary payload with an expiry. Format: base64url(json).sig */
export function signPayload(obj, ttlSeconds) {
  const body = Buffer.from(
    JSON.stringify({ ...obj, exp: Date.now() + ttlSeconds * 1000 })
  ).toString('base64url');
  return `${body}.${hmac(body)}`;
}

/** Verify + decode a signed payload. Returns the object or null. */
export function verifyPayload(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = hmac(body);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const obj = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (obj.exp && Date.now() > obj.exp) return null;
    return obj;
  } catch (err) {
    console.error('[tokenSecurity] verifyPayload error:', err);
    return null;
  }
}

// 55 days: comfortably inside LinkedIn's ~60-day access-token window, so a
// session can never outlive the LinkedIn token it represents.
const SESSION_TTL_SECONDS = 55 * 24 * 3600;

export function signSession(userId) {
  return signPayload({ uid: userId }, SESSION_TTL_SECONDS);
}

/** Throws {status:401} unless the request carries a valid session. */
export function requireSession(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const data = verifyPayload(token);
  if (!data?.uid) {
    const err = new Error('LinkedIn connection required');
    err.status = 401;
    throw err;
  }
  return { userId: data.uid };
}

/**
 * Like requireSession, but honours ALLOW_ANON_GENERATION=true so the
 * Gemini endpoints can be demoed before LinkedIn OAuth is configured.
 * Returns { userId: null } in anonymous mode.
 */
export function maybeRequireSession(req) {
  if (process.env.ALLOW_ANON_GENERATION === 'true') {
    const auth = req.headers.get('authorization') || '';
    const data = verifyPayload(auth.replace(/^Bearer\s+/i, ''));
    return { userId: data?.uid ?? null };
  }
  return requireSession(req);
}
