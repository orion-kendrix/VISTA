// src/shared/api.js
// Phase 1 (Sonnet): All functions return MOCK data.
// Phase 2 (Codex): Replace mock implementations with real fetch calls.
// The function signatures and response shapes MUST NOT change between phases.

import { FUNCTION_URLS } from './constants.js';

const USE_MOCKS = true; // Codex flips this to false

// ─── Mock Data ────────────────────────────────────────────────────────────────

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

// ─── API Functions ─────────────────────────────────────────────────────────────

/**
 * Sends a compressed certificate image to the backend.
 * Returns exactly 5 personalised questions.
 *
 * @param {string} imageBase64 - Base64-encoded image string
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @returns {Promise<{ questions: string[] }>}
 */
export async function analyzeImage(imageBase64, mimeType) {
  if (USE_MOCKS) {
    await delay(1800); // Simulate Gemini latency
    return { questions: MOCK_QUESTIONS };
  }

  const res = await fetch(FUNCTION_URLS.ANALYZE_QUESTIONS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, mimeType }),
  });
  if (!res.ok) throw new Error(`analyze-questions failed: ${res.status}`);
  return res.json();
}

/**
 * Sends user answers and micro-settings to generate a LinkedIn post.
 *
 * @param {string[]} questions - The 5 questions (index-matched to answers)
 * @param {string[]} answers - The user's 5 answers
 * @param {object} microSettings - The full micro-settings object
 * @returns {Promise<{ postText: string }>}
 */
export async function generatePost(questions, answers, microSettings) {
  if (USE_MOCKS) {
    await delay(2200);
    return { postText: MOCK_POST_DRAFT };
  }

  const res = await fetch(FUNCTION_URLS.GENERATE_POST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions, answers, microSettings }),
  });
  if (!res.ok) throw new Error(`generate-post failed: ${res.status}`);
  return res.json();
}

/**
 * Saves the post to the queue and triggers a WhatsApp approval message.
 *
 * @param {object} payload
 * @param {string} payload.postText
 * @param {string} payload.imageBase64
 * @param {string} payload.whatsappNumber - E.164 format e.g. +919876543210
 * @param {string} payload.scheduledAt - ISO 8601 datetime string
 * @param {object} payload.microSettings
 * @param {string[]} payload.questions
 * @param {string[]} payload.answers
 * @returns {Promise<{ postQueueId: string, status: string }>}
 */
export async function schedulePost(payload) {
  if (USE_MOCKS) {
    await delay(1200);
    return {
      postQueueId: 'mock-queue-id-' + Date.now(),
      status: 'pending_approval',
    };
  }

  const res = await fetch(FUNCTION_URLS.SCHEDULE_WHATSAPP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`schedule-whatsapp failed: ${res.status}`);
  return res.json();
}

/**
 * Initiates LinkedIn OAuth by redirecting the user to the auth URL.
 * This is a navigation action, not a fetch — it redirects the browser.
 */
export function initiateLinkedInAuth() {
  if (USE_MOCKS) {
    console.log('[MOCK] Would redirect to LinkedIn OAuth');
    return;
  }
  window.location.href = `${FUNCTION_URLS.CALLBACK}?action=login`;
}

// ─── Utility ───────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
