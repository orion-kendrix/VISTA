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
    let detail = `${res.status}`;
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

const MOCK_POST_DRAFT = `Thrilled to share that I've just earned my AWS Solutions Architect certification! 🎯

This journey wasn't easy — three months of early mornings and weekend study sessions. But every moment was worth it.

What I learned goes far beyond cloud architecture. I learned how to break down complex problems, stay consistent when progress feels invisible, and trust the process.

If you're considering this certification, here's my advice: start before you feel ready. The learning happens in the doing.

Grateful for everyone who supported me along the way. This is just the beginning. 🚀

#AWS #CloudComputing #Certification #Growth #TechCareer`;

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
      whatsappDelivered: true,
    };
  }
  return post(FUNCTION_URLS.SCHEDULE_WHATSAPP, payload);
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
