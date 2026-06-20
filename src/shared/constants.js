// src/shared/constants.js
// Shared enums and keys used across widget and functions.
// ALL AIs read this. NO AI changes this without documenting in their HANDOFF file.

export const STEPS = {
  UPLOAD: 'upload',
  QUESTIONS: 'questions',
  PREVIEW: 'preview',
  SETTINGS: 'settings',
};

export const POST_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  FAILED: 'failed',
};

export const MICRO_SETTINGS_KEYS = {
  TONE: 'tone',
  LENGTH: 'length',
  INDUSTRY: 'industry',
  LANGUAGE: 'language',
  EMOJI_DENSITY: 'emojiDensity',
  HOOK_STYLE: 'hookStyle',
  HASHTAG_COUNT: 'hashtagCount',
  CALL_TO_ACTION: 'callToAction',
  CREDENTIAL_FOCUS: 'credentialFocus',
  AUDIENCE_TARGET: 'audienceTarget',
  FIRST_PERSON: 'firstPerson',
};

export const MICRO_SETTINGS_DEFAULTS = {
  tone: 'professional',
  length: 'medium',
  industry: '',
  language: 'english',
  emojiDensity: 'low',
  hookStyle: 'boldStatement',
  hashtagCount: 5,
  callToAction: true,
  credentialFocus: 'skills',
  audienceTarget: 'general',
  firstPerson: true,
};

export const TONE_OPTIONS = ['professional', 'casual', 'inspirational', 'humble'];
export const LENGTH_OPTIONS = ['short', 'medium', 'long'];
export const LANGUAGE_OPTIONS = ['english', 'hindi', 'hinglish'];
export const EMOJI_DENSITY_OPTIONS = ['none', 'low', 'medium', 'high'];
export const HOOK_STYLE_OPTIONS = ['question', 'boldStatement', 'statistic', 'storyOpener'];
export const CREDENTIAL_FOCUS_OPTIONS = ['skills', 'journey', 'gratitude', 'impact'];
export const AUDIENCE_TARGET_OPTIONS = ['recruiters', 'peers', 'general', 'clients'];

export const FUNCTION_URLS = {
  ANALYZE_QUESTIONS: '/.netlify/functions/analyze-questions',
  GENERATE_POST: '/.netlify/functions/generate-post',
  SCHEDULE_WHATSAPP: '/.netlify/functions/schedule-whatsapp',
  LIST_POSTS: '/.netlify/functions/list-posts',
  APPROVE: '/.netlify/functions/approve',
  CALLBACK: '/.netlify/functions/callback',
};
