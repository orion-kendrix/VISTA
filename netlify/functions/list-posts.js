// netlify/functions/list-posts.js
// POST, session-protected → { posts: [...] }
// Powers the widget "My Posts" view. Returns ONLY the authenticated user's own
// posts (scoped by the session uid), with display-safe columns — never tokens.

import { preflight, json } from './_utils/http.js';
import { requireSession } from './_utils/tokenSecurity.js';
import { listPostsByUser } from './_utils/supabaseClient.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

export default async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json(405, { error: 'POST only' }, req);

  try {
    // A real session is mandatory — post history is always user-scoped.
    const { userId } = requireSession(req);

    // Body is optional; only an integer `limit` is honoured. An empty body is
    // fine (unlike readJson, which would 400), since this is a plain read.
    let limit = DEFAULT_LIMIT;
    const raw = await req.text();
    if (raw) {
      try {
        const n = Number(JSON.parse(raw)?.limit);
        if (Number.isFinite(n)) limit = Math.min(Math.max(1, Math.trunc(n)), MAX_LIMIT);
      } catch { /* malformed body → fall back to default */ }
    }

    const posts = await listPostsByUser(userId, limit);
    return json(200, { posts }, req);
  } catch (err) {
    if (err.status) return json(err.status, { error: err.message }, req);
    console.error('[list-posts] failed:', err);
    return json(500, { error: 'Could not load your posts — please retry' }, req);
  }
};
