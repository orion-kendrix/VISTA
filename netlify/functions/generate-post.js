// netlify/functions/generate-post.js
// POST { questions, answers, microSettings } → { postText }
// Contract source: src/shared/api.js → generatePost().
// Every one of the 11 micro-settings (constants.js) is translated into an
// explicit instruction line — Gemini follows concrete rules far better than
// adjectives.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { preflight, json, readJson } from './_utils/http.js';
import { maybeRequireSession } from './_utils/tokenSecurity.js';

let _genAI = null;
function model() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY env var is not set');
  _genAI ??= new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
}

export default async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json(405, { error: 'POST only' }, req);

  try {
    maybeRequireSession(req);

    const { questions, answers, microSettings } = await readJson(req);
    if (!Array.isArray(questions) || !Array.isArray(answers) || !microSettings) {
      return json(400, { error: 'questions[], answers[] and microSettings are required' }, req);
    }

    const result = await model().generateContent(buildPrompt(questions, answers, microSettings));
    const raw = result.response.text();
    // Backstop for word-like gibberish the client heuristic can't catch
    // ('tesitni', 'egerg'): the prompt is told to emit this sentinel when the
    // answers are nonsense, so we reject instead of publishing meaningless text.
    if (/VISTA_INSUFFICIENT/i.test(raw)) {
      return json(422, { error: "Those answers don't give us enough real detail to write a good post — add a sentence or two of genuine detail and try again." }, req);
    }
    const postText = cleanOutput(raw);
    if (!postText) {
      return json(502, { error: 'Post generation returned empty output — please retry' }, req);
    }

    return json(200, { postText }, req);
  } catch (err) {
    if (err.status) return json(err.status, { error: err.message }, req);
    console.error('[generate-post] failed:', err);
    return json(500, { error: 'Post generation failed — please retry' }, req);
  }
};

// ── prompt assembly ──────────────────────────────────────────────────────────

const LENGTH = { short: 'around 150 words', medium: 'around 250 words', long: 'around 400 words' };
const HOOK = {
  question: 'Open the post with a thought-provoking question.',
  boldStatement: 'Open the post with one bold, confident statement.',
  statistic: 'Open the post with a striking number or statistic from the journey.',
  storyOpener: 'Open the post with a one-or-two sentence personal story moment.',
};
const EMOJI = {
  none: 'Do not use any emojis.',
  low: 'Use 1–3 emojis in the whole post.',
  medium: 'Use 4–7 emojis, spread naturally.',
  high: 'Use emojis generously throughout, while staying professional.',
};
const LANGUAGE = {
  english: 'Write the post in English.',
  hindi: 'Write the post in Hindi (Devanagari script).',
  hinglish: 'Write the post in Hinglish — a natural everyday mix of Hindi and English, with Hindi words in Latin script.',
};
const FOCUS = {
  skills: 'Centre the post on the concrete skills gained.',
  journey: 'Centre the post on the preparation journey and persistence.',
  gratitude: 'Centre the post on gratitude to mentors, peers and supporters.',
  impact: 'Centre the post on the real-world impact this unlocks.',
};
const AUDIENCE = {
  recruiters: 'Write for recruiters and hiring managers scanning for capability signals.',
  peers: 'Write for industry peers who appreciate technical depth.',
  general: 'Write for a broad professional audience.',
  clients: 'Write for potential clients evaluating credibility.',
};

function buildPrompt(questions, answers, s) {
  const qa = questions
    .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]?.trim() || '(not answered)'}`)
    .join('\n\n');

  const rules = [
    LANGUAGE[s.language] || LANGUAGE.english,
    `Tone: ${s.tone || 'professional'}.`,
    `Target length: ${LENGTH[s.length] || LENGTH.medium}.`,
    HOOK[s.hookStyle] || HOOK.boldStatement,
    EMOJI[s.emojiDensity] || EMOJI.low,
    FOCUS[s.credentialFocus] || FOCUS.skills,
    AUDIENCE[s.audienceTarget] || AUDIENCE.general,
    s.firstPerson === false
      ? 'Write in third person, never using "I".'
      : 'Write in first person ("I").',
    s.industry ? `The author works in the ${s.industry} industry — make references land there.` : null,
    s.callToAction
      ? 'End with a short, genuine call to action inviting comments or connections.'
      : 'Do not add any call to action.',
    Number(s.hashtagCount) > 0
      ? `Finish with exactly ${Number(s.hashtagCount)} relevant hashtags on the final line.`
      : 'Do not include any hashtags.',
  ].filter(Boolean);

  return `You are a ghostwriter helping a real professional post — in their own voice — that they earned a certification. Your job is to make it sound like a specific thoughtful human wrote it in five minutes, NOT like a brand, a press release, or an AI.

Build the post ENTIRELY from their own words below. Never invent facts, numbers, names, employers, or feelings they didn't actually express. If a detail isn't in their answers, leave it out — a shorter honest post beats a padded generic one.

IMPORTANT: If the answers are gibberish, random characters, or nonsense that does not describe a real achievement or experience (e.g. "asdf", "tesitni", keyboard mashing, single random words), do NOT write a post. Instead reply with EXACTLY this one word and nothing else: VISTA_INSUFFICIENT

THEIR ANSWERS:
${qa}

WRITE IT LIKE A HUMAN:
- Lead with something concrete and specific from THEIR answers — a real detail, a real struggle, a real result. Specificity is the whole difference between a good post and a generic one.
- Plain, direct, a little understated. It's fine to be proud; it's not fine to be grandiose or salesy.
- Vary the rhythm: mix short and longer sentences, and use normal paragraphs of 1–3 sentences. Do NOT put every single sentence on its own line for drama.
- If a sentence could sit word-for-word on anyone's post about any certificate, cut it or rewrite it into something only THIS person could say.

NEVER USE THESE — they are the clichés that make LinkedIn posts cringe, avoid them completely:
- Opening with "I'm thrilled / humbled / excited / proud to announce" (or "to share"). Start somewhere real instead.
- Filler hype: "beyond grateful", "blessed", "the grind", "game-changer", "next level", "onwards and upwards", "the sky's the limit", "this is just the beginning", "the rest is history".
- Story-tropes: "Little did I know…", "Plot twist:", "Here's the thing:", "And the best part?", "I'm not gonna lie…".
- Manufactured inspiration, fake vulnerability, or "lessons learned" that don't actually come from their answers.
- Rhetorical-question spam, and don't tack on "What's your experience? Drop a comment!" unless a call to action is explicitly requested below.

RULES (follow every one):
${rules.map((r) => `- ${r}`).join('\n')}

Return ONLY the post text. No preamble, no surrounding quotes, no markdown fences.`;
}

function cleanOutput(text) {
  return String(text || '')
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/```\s*$/, '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim();
}
