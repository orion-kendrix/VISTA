// netlify/functions/analyze-questions.js
// POST { image: base64, mimeType } → { questions: string[5] }
// Contract source: src/shared/api.js → analyzeImage().

import { GoogleGenerativeAI } from '@google/generative-ai';
import { preflight, json, readJson } from './_utils/http.js';
import { maybeRequireSession } from './_utils/tokenSecurity.js';

const PROMPT = `You are VISTA, an assistant that turns certificates into personal LinkedIn posts.
Look at this certificate or achievement image. Identify what was earned, who issued it, and the field it belongs to.
Then write EXACTLY 5 short, warm, open-ended questions that help the owner reflect on THIS specific achievement.
Cover, roughly: skills gained, the preparation journey, career relevance, advice for others, and one surprise or lesson.
Reference the actual certificate details where possible (its name, issuer, or field).
Respond with ONLY a JSON array of 5 strings. No markdown, no commentary, no keys — just the array.`;

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

    const { image, mimeType } = await readJson(req);
    if (!image || !mimeType) {
      return json(400, { error: 'image (base64) and mimeType are required' }, req);
    }
    // ~3M base64 chars ≈ 2.2 MB binary; widget compresses well below this.
    if (image.length > 3_000_000) {
      return json(413, { error: 'Image too large — please use a smaller file' }, req);
    }

    const result = await model().generateContent([
      { inlineData: { data: image, mimeType } },
      { text: PROMPT },
    ]);

    const questions = parseQuestions(result.response.text());
    if (!questions) {
      console.error('[analyze-questions] unparseable Gemini output:', result.response.text().slice(0, 300));
      return json(502, { error: 'The analysis returned an unexpected format — please retry' }, req);
    }

    return json(200, { questions }, req);
  } catch (err) {
    if (err.status) return json(err.status, { error: err.message }, req);
    console.error('[analyze-questions] failed:', err);
    return json(500, { error: 'Certificate analysis failed — please retry' }, req);
  }
};

/** Tolerant extraction: strip code fences, find the array, demand 5 strings. */
function parseQuestions(text) {
  try {
    const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return null;
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    const qs = arr.map((q) => String(q).trim()).filter(Boolean);
    return qs.length === 5 ? qs : null;
  } catch {
    return null;
  }
}
