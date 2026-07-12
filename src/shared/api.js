// src/shared/api.js
// Phase 1 wrote these as mocks; Phase 2/3 (this version) adds the real fetch
// implementations. THE FUNCTION SIGNATURES AND RESPONSE SHAPES ARE UNCHANGED —
// they are the frozen contract between widget and functions (RULES.md).
//
// Mode switching:
//   window.VISTA_USE_MOCKS = true   → mock data (standalone widget testing, R5)
//   otherwise                       → real Netlify function calls
// Cross-origin embedding (Vortex):
//   window.VISTA_API_BASE = 'https://vista.netlify.app'  (set by embed.js)

import { FUNCTION_URLS } from './constants.js';

const isBrowser = typeof window !== 'undefined';
const useMocks = () => isBrowser && window.VISTA_USE_MOCKS === true;
const apiBase = () => (isBrowser && window.VISTA_API_BASE) || '';

const SESSION_KEY = 'vista_session';

// ─── Session helpers ──────────────────────────────────────────────────────────
// The LinkedIn OAuth callback redirects back with #vista_session=<token>.
// We stash it in localStorage and strip the fragment so it never lingers in
// the address bar or browser history.

export function consumeSessionFromUrl() {
  if (!isBrowser) return;
  const hash = window.location.hash || '';
  const m = hash.match(/vista_session=([^&]+)/);
  if (m) {
    try { localStorage.setItem(SESSION_KEY, decodeURIComponent(m[1])); }
    catch (err) { console.error('[VISTA] Could not persist session:', err); }
    const clean = window.location.pathname + window.location.search;
    history.replaceState(null, '', clean);
  }
  const e = hash.match(/vista_error=([^&]+)/);
  if (e) console.error('[VISTA] OAuth error:', decodeURIComponent(e[1]));
}

export function getSession() {
  if (!isBrowser) return null;
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}

export function clearSession() {
  if (!isBrowser) return;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ }
}

export class AuthRequiredError extends Error {
  constructor(message = 'LinkedIn connection required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

// ─── Shared request helper ────────────────────────────────────────────────────
async function post(url, payload) {
  let res;
  try {
    res = await fetch(apiBase() + url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getSession() ? { Authorization: `Bearer ${getSession()}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Network-level failure (offline, CORS, DNS) — distinct from API errors.
    throw new Error(`Network error reaching VISTA backend: ${err.message}`);
  }

  if (res.status === 401) {
    clearSession(); // token invalid/expired — force a fresh connect
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    let detail = `The server returned an error (${res.status}). Please retry.`;
    try { detail = (await res.json()).error || detail; } catch { /* non-JSON body */ }
    throw new Error(detail);
  }
  return res.json();
}

// ─── Mock data (unchanged shapes from Phase 1) ───────────────────────────────
const MOCK_QUESTIONS = [
  "What specific skills did you develop or validate through earning this certification?",
  "How long did you prepare for this, and what was the most challenging part of the journey?",
  "How does this certification align with your current role or career goals?",
  "What would you say to someone who is considering pursuing this same certification?",
  "What is one thing you wish you had known before starting this certification journey?",
];

const MOCK_POST_DRAFT = `Subnets and route tables never clicked for me — until I built a small three-tier app on AWS and broke it a few times on purpose. That's when the networking section of the Solutions Architect exam finally made sense.

It took about four months of studying after work. The practice exams got me to pass, but the hands-on project is what actually made it stick.

I'm a backend dev and we're migrating our monolith to AWS this year, so this is what I'll be doing day to day now — designing for multi-AZ failover, picking storage classes for cost, not just memorising the diagrams.

One thing I underestimated: the exam cares about cost trade-offs as much as architecture. If you're preparing, don't under-study billing like I did.

#AWS #CloudArchitecture #BackendDevelopment #Certification #LearningByBuilding`;

const MOCK_POSTS = [
  {
    id: 'mock-1', status: 'published',
    post_text: 'Thrilled to share that I just earned my AWS Solutions Architect certification! Three months of early mornings finally paid off. 🚀',
    scheduled_at: null, published_at: '2026-06-15T09:00:00Z',
    linkedin_post_id: 'urn:li:share:7000000000000000001', created_at: '2026-06-14T18:00:00Z',
  },
  {
    id: 'mock-2', status: 'approved',
    post_text: 'Just wrapped up my Google Data Analytics certificate — excited to put these skills to work on real dashboards.',
    scheduled_at: '2026-06-25T09:00:00Z', published_at: null,
    linkedin_post_id: null, created_at: '2026-06-19T12:30:00Z',
  },
  {
    id: 'mock-3', status: 'pending_approval',
    post_text: 'Earned my Scrum Master certification this week. Grateful to the mentors who pushed me to think in sprints.',
    scheduled_at: '2026-06-22T18:00:00Z', published_at: null,
    linkedin_post_id: null, created_at: '2026-06-20T08:15:00Z',
  },
  {
    id: 'mock-4', status: 'failed',
    post_text: 'Completed the Meta Front-End Developer program — onto building delightful UIs.',
    scheduled_at: '2026-06-10T09:00:00Z', published_at: null,
    linkedin_post_id: null, created_at: '2026-06-09T20:00:00Z',
  },
];

// ─── API surface (frozen contract) ───────────────────────────────────────────

/**
 * Certificate image → exactly 5 personalised questions.
 * @param {string} imageBase64
 * @param {string} mimeType
 * @returns {Promise<{ questions: string[] }>}
 */
export async function analyzeImage(imageBase64, mimeType) {
  if (useMocks()) {
    await delay(1600);
    return { questions: MOCK_QUESTIONS };
  }
  return post(FUNCTION_URLS.ANALYZE_QUESTIONS, { image: imageBase64, mimeType });
}

/**
 * Answers + micro-settings → LinkedIn post draft.
 * @returns {Promise<{ postText: string }>}
 */
export async function generatePost(questions, answers, microSettings) {
  if (useMocks()) {
    await delay(2000);
    return { postText: MOCK_POST_DRAFT };
  }
  return post(FUNCTION_URLS.GENERATE_POST, { questions, answers, microSettings });
}

/**
 * Save the post, create the approval token, ping WhatsApp.
 * Response keeps the frozen { postQueueId, status } shape; the real backend
 * additionally returns { whatsappDelivered, approveUrl? } so the widget can
 * fall back to a manual approval link when CallMeBot is unreachable.
 * @returns {Promise<{ postQueueId: string, status: string, whatsappDelivered?: boolean, approveUrl?: string }>}
 */
export async function schedulePost(payload) {
  if (useMocks()) {
    await delay(1100);
    return {
      postQueueId: 'mock-queue-id-' + Date.now(),
      status: 'pending_approval',
      emailDelivered: true,
    };
  }
  return post(FUNCTION_URLS.SCHEDULE_WHATSAPP, payload);
}

/**
 * The authenticated user's own posts, newest first, for the "My Posts" view.
 * @param {number} [limit]
 * @returns {Promise<{ posts: Array<{ id, status, post_text, scheduled_at, published_at, linkedin_post_id, created_at }> }>}
 */
export async function listPosts(limit) {
  if (useMocks()) {
    await delay(600);
    return { posts: MOCK_POSTS };
  }
  return post(FUNCTION_URLS.LIST_POSTS, limit ? { limit } : {});
}

/**
 * Kick off LinkedIn OAuth. Navigation, not fetch — the callback function
 * redirects back to return_to with #vista_session=<token>.
 */
export function initiateLinkedInAuth() {
  if (useMocks()) {
    console.log('[MOCK] Would redirect to LinkedIn OAuth');
    return;
  }
  const returnTo = encodeURIComponent(window.location.href);
  window.location.href =
    `${apiBase()}${FUNCTION_URLS.CALLBACK}?action=login&return_to=${returnTo}`;
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
