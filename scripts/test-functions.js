// scripts/test-functions.js
// R5 smoke test: every Netlify function must respond correctly when called in
// isolation. This checks the CONTRACT SURFACE (auth guards, validation, status
// codes) — it needs no API keys and never writes to the database.
//
// Usage:
//   1. In one terminal:  netlify dev
//   2. In another:       npm run test:functions
//   Against a deploy:    VISTA_BASE_URL=https://your-site.netlify.app npm run test:functions
//
// Note: when ALLOW_ANON_GENERATION=true, analyze/generate return 400 (bad
// input) instead of 401 (no session) — both are accepted where relevant.

const BASE = (process.env.VISTA_BASE_URL || 'http://localhost:8888').replace(/\/$/, '');

const checks = [
  {
    name: 'analyze-questions rejects empty/unauthenticated calls',
    req: ['/.netlify/functions/analyze-questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
    expect: [400, 401],
  },
  {
    name: 'analyze-questions rejects non-POST',
    req: ['/.netlify/functions/analyze-questions', { method: 'GET' }],
    expect: [405],
  },
  {
    name: 'generate-post rejects empty/unauthenticated calls',
    req: ['/.netlify/functions/generate-post', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
    expect: [400, 401],
  },
  {
    name: 'schedule-whatsapp requires a session (always)',
    req: ['/.netlify/functions/schedule-whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
    expect: [401],
  },
  {
    name: 'list-posts requires a session (always)',
    req: ['/.netlify/functions/list-posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
    expect: [401],
  },
  {
    name: 'list-posts rejects non-POST',
    req: ['/.netlify/functions/list-posts', { method: 'GET' }],
    expect: [405],
  },
  {
    name: 'approve rejects a malformed link',
    req: ['/.netlify/functions/approve', { method: 'GET' }],
    expect: [400],
  },
  {
    name: 'scheduler rejects calls without the Bearer secret',
    req: ['/.netlify/functions/scheduler', { method: 'POST' }],
    expect: [401],
  },
  {
    name: 'callback login leg redirects (302) or fails loudly (4xx/5xx), never hangs',
    req: ['/.netlify/functions/callback?action=login', { method: 'GET', redirect: 'manual' }],
    expect: [302, 400, 500],
  },
  {
    name: 'CORS preflight is answered',
    req: ['/.netlify/functions/analyze-questions', { method: 'OPTIONS', headers: { Origin: 'https://example.com' } }],
    expect: [204],
  },
];

let failed = 0;

for (const { name, req, expect } of checks) {
  const [path, init] = req;
  try {
    const res = await fetch(BASE + path, init);
    if (expect.includes(res.status)) {
      console.log(`  PASS  ${name} (${res.status})`);
    } else {
      failed++;
      const body = (await res.text()).slice(0, 200);
      console.error(`  FAIL  ${name} — got ${res.status}, expected one of [${expect}]\n        ${body}`);
    }
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name} — request error: ${err.message}`);
  }
}

console.log(failed === 0
  ? `\nAll ${checks.length} contract checks passed against ${BASE}`
  : `\n${failed}/${checks.length} checks FAILED against ${BASE}`);
process.exit(failed === 0 ? 0 : 1);
