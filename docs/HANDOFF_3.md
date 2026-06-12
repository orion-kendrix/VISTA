# HANDOFF_3.md — Phase 4: Bug-Fix & Hardening Pass Complete
> Written by: Claude Fable 5 (Claude Code)
> Date: 2026-06-12
> Phase: 4 (full-codebase audit + fixes, authorized by Shivesh)
> Status: Complete — MVP is code-complete and verified in mock mode

---

## What Was Built

No new features. This phase was a top-to-bottom audit of every layer
(database, functions, widget, integration) against the contracts in
HANDOFF_0–2, followed by fixes. Cross-layer edits were explicitly authorized
by Shivesh ("fix all the bugs"), which per RULES.md is the human lead's call
to make. In practice no `netlify/functions/` or `supabase/` code needed
changing — the backend audit came back clean. Every fix landed in the
widget, the integration config, or repo hygiene.

The headline finding: `netlify.toml` declared per-function `timeout` keys,
which are not a supported configuration property — that was a potential
deploy blocker and is now removed (the 10 s default is sufficient for
`gemini-2.5-flash`). The rest were widget-level correctness and UX bugs,
plus stale duplicate files at the repo root — including an old Phase-1
`api.js` with mocks hardcoded ON sitting next to the real one.

The full widget flow was then verified in a real browser (mock mode):
upload → compression → questions (3-of-5 gate) → preview (edit + char
guard) → settings (stale-draft marking, E.164 normalisation) → submit →
success view. Two complete runs, zero console errors. The new
`npm run test:functions` smoke test covers the backend contract surface
(auth guards, validation, CORS preflight) without needing any API keys.

## File Map

```
netlify.toml                     — removed unsupported per-function timeout keys
src/widget/steps/Step4Settings.js— country code now normalised to E.164 before submit
src/widget/steps/Step3Preview.js — Next disabled while draft exceeds 3000 chars
src/widget/steps/Step1Upload.js  — same-file re-select fixed; new upload/remove
                                   locks downstream stepper pills (maxReachedIndex)
src/widget/FABWidget.js          — Escape listener unhooked on destroy(); panel tabindex
src/widget/widget.css            — stepper spacing tightened (Segoe UI overflowed 18px)
src/shared/api.js                — friendlier message for non-JSON error responses
scripts/test-functions.js        — NEW: keyless contract smoke test (npm run test:functions)
scripts/dev-server.js            — NEW: zero-dep static server for mock-mode dev
docs/KNOWN_ISSUES.md             — NEW: required by ARCHITECTURE.md, was never created
README.md                        — quickstart, deploy summary, smoke-test instructions
DELETED from repo root: api.js (stale Phase-1 stub), constants.js, RULES.md,
  ARCHITECTURE.md, HANDOFF_TEMPLATE.md, ANTIGRAVITY_PHASE0_PROMPT.md,
  HANDOFF_1.md, HANDOFF_2.md — canonical copies live in docs/ and src/shared/.
```

## API Contracts

Unchanged. The frozen surface from HANDOFF_2 is implemented exactly as
documented; this phase only verified it (see `scripts/test-functions.js`).

## Environment Variables

None added, none changed. `.env.example` remains canonical.

## Decisions Made

| Decision | Reason |
|----------|--------|
| Removed `timeout` keys rather than keeping them as no-ops | Unsupported netlify.toml properties can fail deploy validation; Netlify ignores them at best. A comment now documents the 10 s reality. |
| E.164 normalisation client-side (Step 4) instead of loosening the server | The server regex is the contract; the widget is where user input gets messy ("91" vs "+91" vs "0091"). |
| `maxReachedIndex` reset on new upload/remove | A new certificate invalidates questions and draft; leaving Preview/Schedule pills tappable let users generate a post from empty answers. |
| Deleted root duplicates instead of syncing them | Two copies of an API contract is how drift starts; the stale root api.js had `USE_MOCKS = true` hardcoded — embedding it by mistake would ship a fake backend. |
| Kept seed.sql untouched but documented "dev-only" | Schema layer is frozen (R3); the production risk (scheduler picks up the fake approved post) is a runbook note, not a code change. |

## Known Rough Edges

Moved to `docs/KNOWN_ISSUES.md` (the running log ARCHITECTURE.md calls for).
Highlights: LinkedIn app products must be approved before publishing works;
no LinkedIn token refresh; OAuth mid-flow loses widget state; PDFs are
second-class; CallMeBot is single-recipient.

## Bugs Found in Other Layers

- None open. The Phase 0 schema and Phase 2 functions audited clean —
  claim-before-publish, single-use approval tokens, and the CORS/auth
  guards all match their documented intent.

## Schema Change Requests

- None new. The two from HANDOFF_2 (`users.callmebot_key`,
  `post_queue.failure_reason`) remain open and worthwhile.

## Blockers

- None in code. Going live needs credentials only (see "What the Next
  Phase Should Do First").

## Architectural Concerns

- None. The stateless-HMAC session design held up under audit.

## What the Next Phase Should Do First

> Deploy. Follow README.md "Deploy" (full detail in HANDOFF_2's runbook):
> Supabase project + migrations + public `certificates` bucket, Gemini key,
> LinkedIn app with both products, Netlify env vars, cron on the scheduler.
> Then run `VISTA_BASE_URL=https://<site>.netlify.app npm run test:functions`
> and walk the widget once in `?live` mode with a real certificate.

## Prompt for the Next AI

> You are working on VISTA, a LinkedIn post scheduling agent that is
> code-complete. Read docs/RULES.md, docs/HANDOFF_3.md, and
> docs/KNOWN_ISSUES.md before writing anything. There is no feature work
> left; the next session is deployment support and live-mode smoke testing.
> Do not refactor working code. Start by asking Shivesh which deployment
> runbook step he is on.
