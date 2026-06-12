// netlify/functions/callback.js
// LinkedIn OAuth, both directions:
//   GET ?action=login&return_to=…  → 302 to LinkedIn's consent screen
//   GET ?code=…&state=…            → exchange code, upsert user, redirect back
//                                     to return_to with #vista_session=<token>
//
// The return_to URL rides inside the signed OAuth `state` payload, which both
// satisfies LinkedIn's CSRF expectation and prevents tampering. An origin
// allowlist (APP_URL + EXTRA_ALLOWED_ORIGINS + localhost) blocks open-redirects.

import { buildAuthUrl, exchangeCode, getUserInfo } from './_utils/linkedinClient.js';
import { upsertUserFromLinkedIn } from './_utils/supabaseClient.js';
import { signPayload, verifyPayload, signSession } from './_utils/tokenSecurity.js';

export default async (req) => {
  const url = new URL(req.url);

  try {
    // ── Leg 1: start the dance ──────────────────────────────────────────────
    if (url.searchParams.get('action') === 'login') {
      const returnTo = url.searchParams.get('return_to') || process.env.APP_URL;
      if (!returnTo) {
        return textError(400, 'return_to missing and APP_URL not configured');
      }
      assertAllowedReturnTo(returnTo);
      const state = signPayload({ r: returnTo }, 600); // 10-minute window
      return Response.redirect(buildAuthUrl(state), 302);
    }

    // ── Leg 2: LinkedIn sends the user back ────────────────────────────────
    const state = verifyPayload(url.searchParams.get('state') || '');
    const returnTo = state?.r || process.env.APP_URL;

    const liError = url.searchParams.get('error');
    if (liError) {
      const desc = url.searchParams.get('error_description') || liError;
      console.error('[callback] LinkedIn returned error:', desc);
      return redirectWithFragment(returnTo, `vista_error=${encodeURIComponent(desc)}`);
    }

    const code = url.searchParams.get('code');
    if (!code || !state) {
      console.error('[callback] missing code or invalid state');
      return redirectWithFragment(returnTo, 'vista_error=Invalid%20OAuth%20response');
    }

    const { access_token, expires_in } = await exchangeCode(code);
    const profile = await getUserInfo(access_token);

    const user = await upsertUserFromLinkedIn({
      linkedinId: profile.sub,
      accessToken: access_token,
      tokenExpiresAt: new Date(Date.now() + (expires_in || 5184000) * 1000).toISOString(),
    });

    const session = signSession(user.id);
    return redirectWithFragment(returnTo, `vista_session=${encodeURIComponent(session)}`);
  } catch (err) {
    console.error('[callback] OAuth flow failed:', err);
    const fallback = process.env.APP_URL || '/';
    return redirectWithFragment(fallback, 'vista_error=LinkedIn%20sign-in%20failed');
  }
};

// ── helpers ──────────────────────────────────────────────────────────────────

function assertAllowedReturnTo(raw) {
  const target = new URL(raw); // throws on garbage → caught above
  const allowed = new Set();

  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  for (const o of (process.env.EXTRA_ALLOWED_ORIGINS || '').split(',')) {
    if (o.trim()) allowed.add(o.trim());
  }

  const isLocalhost = ['localhost', '127.0.0.1'].includes(target.hostname);
  if (!allowed.has(target.origin) && !isLocalhost) {
    throw new Error(`return_to origin not allowed: ${target.origin}`);
  }
}

function redirectWithFragment(base, fragment) {
  let dest;
  try {
    dest = new URL(base || '/', process.env.APP_URL || 'http://localhost:8888');
  } catch {
    dest = new URL(process.env.APP_URL || 'http://localhost:8888');
  }
  dest.hash = fragment;
  return Response.redirect(dest.toString(), 302);
}

function textError(status, message) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain' } });
}
