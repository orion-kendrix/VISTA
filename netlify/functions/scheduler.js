// netlify/functions/scheduler.js
// POST, protected by `Authorization: Bearer ${SCHEDULER_SECRET}` — trigger it
// every 15 minutes from cron-job.org (or GitHub Actions). Publishes due posts.
//
// Hard rules implemented here (RULES.md / HANDOFF_0):
//   * claimPost() flips approved → processing BEFORE any LinkedIn call, with
//     a status guard, so a retried/overlapping run can never double-publish.
//   * Users with a missing or expired LinkedIn token are marked failed, not
//     silently skipped — failures must be visible (R8).
//   * Batch capped at 5 per run to stay inside Netlify's 26s ceiling; the
//     next tick picks up the rest.

import { preflight, json } from './_utils/http.js';
import {
  getDuePosts, claimPost, getUser, markPublished, markFailed,
} from './_utils/supabaseClient.js';
import { publishPost } from './_utils/linkedinClient.js';

const BATCH_LIMIT = 5;

export default async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json(405, { error: 'POST only' }, req);

  const secret = process.env.SCHEDULER_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return json(401, { error: 'unauthorized' }, req);
  }

  const results = { found: 0, published: [], failed: [], skipped: [] };

  try {
    const due = await getDuePosts(BATCH_LIMIT);
    results.found = due.length;

    for (const post of due) {
      try {
        const claimed = await claimPost(post.id);
        if (!claimed) {
          // Another run already owns it — that's the guard working.
          results.skipped.push(post.id);
          continue;
        }

        const user = await getUser(post.user_id);
        const tokenDead =
          !user?.access_token ||
          (user.token_expires_at && new Date(user.token_expires_at) < new Date());
        if (tokenDead) {
          await markFailed(post.id);
          results.failed.push({ id: post.id, reason: 'LinkedIn token missing or expired — user must reconnect' });
          continue;
        }

        const linkedinPostId = await publishPost({
          accessToken: user.access_token,
          personUrn: `urn:li:person:${user.linkedin_id}`,
          text: post.post_text,
          imageUrl: post.image_url,
        });

        await markPublished(post.id, linkedinPostId);
        results.published.push(post.id);
      } catch (err) {
        console.error(`[scheduler] post ${post.id} failed:`, err);
        try {
          await markFailed(post.id);
        } catch (markErr) {
          // Worst case: post stuck in 'processing'. Logged for manual triage.
          console.error(`[scheduler] could not mark ${post.id} failed:`, markErr);
        }
        results.failed.push({ id: post.id, reason: err.message });
      }
    }

    return json(200, results, req);
  } catch (err) {
    console.error('[scheduler] run failed:', err);
    return json(500, { error: 'scheduler run failed', detail: err.message }, req);
  }
};
