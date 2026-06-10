# VISTA — Claude Code Context
# This file is read automatically by Claude Code at the start of every session.
# Do not delete or rename this file.

## Project
VISTA is a LinkedIn post scheduling agent. Users upload a certificate image,
answer 5 AI-generated questions, and VISTA generates and auto-publishes a
LinkedIn post after WhatsApp approval.

GitHub: https://github.com/orion-kendrix/VISTA

## Before you write any code
Read these files in this order:
1. docs/RULES.md          — the law for all AI agents on this project
2. docs/ARCHITECTURE.md   — full system design and table schemas
3. The most recent HANDOFF file in docs/ (HANDOFF_0.md, then HANDOFF_1.md, etc.)

## You are Claude Sonnet or Opus working for Shivesh (Person 1 — Project Lead)

### Shivesh's owned files
- src/widget/             ← you may freely create and edit here
- src/shared/api.js       ← you may edit stubs here (Phase 1 only)
- src/shared/constants.js ← READ ONLY after Phase 0
- docs/HANDOFF_*.md       ← you write these at end of each phase
- CLAUDE.md               ← this file

### Off-limits (read for context only — never edit)
- supabase/               ← owned by Person 2
- netlify/functions/      ← owned by Person 2 and Person 3
- netlify/functions/_utils/ ← owned by Person 2 and Person 3

## Key rules
- Never hardcode API keys, URLs, or secrets — use .env variables
- All API calls from the widget go through src/shared/api.js stubs
- No framework dependencies — vanilla JS only in src/widget/
- CSS must use CSS variables from widget.css — no hardcoded hex colours
- Every async operation must have a try/catch

## Quick file map
src/shared/constants.js   — all enums (POST_STATUS, STEPS, MICRO_SETTINGS_KEYS)
src/shared/api.js         — stub functions the widget calls (analyzeImage, generatePost, schedulePost)
netlify.toml              — function routing and timeouts
.env.example              — all required environment variables

## When you finish a session
Write docs/HANDOFF_[N].md using the template at docs/HANDOFF_TEMPLATE.md.
Commit with: git add -A && git commit -m "phase-[N]: handoff ready" && git push
