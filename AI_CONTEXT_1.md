# VISTA — AI Session Starter
# ─────────────────────────────────────────────────────────────────────────────
# INSTRUCTIONS FOR TEAMMATES:
# Copy this ENTIRE file and paste it as your FIRST message in whatever
# AI you are using (Claude free, Codex, ChatGPT, Antigravity, anything).
# Then in your SECOND message, tell the AI which phase you are working on.
# Do this at the start of EVERY new session — AI tools have no memory between sessions.
# ─────────────────────────────────────────────────────────────────────────────

## Project: VISTA
Visual Intelligence & Smart Task Agent.
A LinkedIn post scheduling agent. Users upload a certificate image → answer
5 AI-generated questions → get a LinkedIn post draft → approve via WhatsApp →
post is auto-published to LinkedIn at the scheduled time.

GitHub repository: https://github.com/orion-kendrix/VISTA
Clone it before starting: git clone https://github.com/orion-kendrix/VISTA.git

---

## The rule that governs everything
One person owns one layer. You do not touch files outside your assigned layer.
If you find a bug in another person's layer, document it in your HANDOFF file.
Do not fix it. Do not refactor it. Document and move on.

---

## Layer ownership map

| Layer                   | Owner    | Folders                              |
|-------------------------|----------|--------------------------------------|
| Database schema         | Person 2 | supabase/                            |
| Serverless functions    | Person 2 + 3 | netlify/functions/               |
| Frontend widget         | Person 1 (Shivesh) | src/widget/, src/shared/   |
| Integration / embed     | Person 1 (Shivesh) | src/widget/embed.js        |

---

## Project folder structure

```
VISTA/
├── docs/
│   ├── RULES.md              ← Read this before writing any code
│   ├── ARCHITECTURE.md       ← Full schema and API reference
│   ├── HANDOFF_TEMPLATE.md   ← Fill this in when you finish
│   ├── HANDOFF_0.md          ← Written by Person 2 after schema
│   ├── HANDOFF_1.md          ← Written by Person 1 after widget
│   └── HANDOFF_2.md          ← Written by Person 2+3 after functions
│
├── supabase/
│   └── migrations/           ← Person 2: SQL schema files go here
│
├── netlify/
│   └── functions/
│       ├── _utils/           ← supabaseClient.js, linkedinClient.js, tokenSecurity.js
│       ├── callback.js       ← Person 2: LinkedIn OAuth
│       ├── analyze-questions.js  ← Person 3: Gemini image → questions
│       ├── generate-post.js  ← Person 3: Gemini answers → post draft
│       ├── schedule-whatsapp.js  ← Person 3: WhatsApp approval ping
│       ├── approve.js        ← Person 3: WhatsApp tap handler
│       └── scheduler.js      ← Person 2: Cron publisher
│
├── src/
│   ├── shared/
│   │   ├── constants.js      ← READ ONLY — shared enums for all layers
│   │   └── api.js            ← READ ONLY — API signatures you must match exactly
│   └── widget/               ← Person 1 only — do not touch
│
├── .env.example              ← All required environment variables listed here
└── netlify.toml              ← Function routing and timeouts
```

---

## The shared contracts (READ ONLY for everyone)

`src/shared/constants.js` defines the POST_STATUS enum values you must use:
- draft, pending_approval, approved, rejected, processing, published, failed

`src/shared/api.js` defines the exact API function signatures the widget calls.
Your function endpoints MUST match these shapes exactly — same request fields,
same response fields, same error behaviour. The widget breaks if they don't match.

---

## Universal rules for all AI agents

**R1** — Read docs/RULES.md and the most recent HANDOFF file before writing anything.

**R2** — Never touch files outside your owned layer. Read-only access only.

**R3** — Never change supabase/migrations/ after it has been written. Schema is frozen.

**R4** — Never hardcode secrets, API keys, or URLs. All config comes from environment
         variables listed in .env.example. If you need a new one, add it there with a comment.

**R5** — Every async function must have a try/catch. No silent failures.

**R6** — Write docs/HANDOFF_[N].md before ending your session. Use the template.
         Commit with: git commit -m "phase-[N]: handoff ready"

**R7** — Naming: database columns = snake_case, JavaScript = camelCase,
         files = kebab-case for CSS/HTML, camelCase.js for modules, SCREAMING_SNAKE for env vars.

---

## Person 2 — what you build

Read docs/HANDOFF_0.md first (written by Shivesh after schema is done).

Your files:
- supabase/migrations/001_initial_schema.sql  — 3 tables: users, post_queue, questionnaire_responses
- supabase/migrations/002_rls_policies.sql    — Row Level Security
- supabase/seed.sql                           — test data for all UI states
- netlify/functions/callback.js               — LinkedIn OAuth token exchange
- netlify/functions/scheduler.js              — cron publisher (marks processing BEFORE publishing)
- netlify/functions/_utils/supabaseClient.js  — ALL Supabase queries centralised here
- netlify/functions/_utils/linkedinClient.js  — ALL LinkedIn API calls centralised here

Key constraint: scheduler.js MUST set post status to 'processing' BEFORE calling the
LinkedIn API. This prevents double-publishing if the function retries.

---

## Person 3 — what you build

Read docs/HANDOFF_1.md first (written by Shivesh after widget is done).

Your files:
- netlify/functions/analyze-questions.js   — accepts base64 image, calls Gemini, returns 5 questions
- netlify/functions/generate-post.js       — accepts answers + micro-settings, returns post text
- netlify/functions/schedule-whatsapp.js   — creates approval token, saves post, pings CallMeBot
- netlify/functions/approve.js             — validates token, updates post_queue status
- netlify/functions/_utils/tokenSecurity.js — token generation and expiry validation

Key constraint: approval tokens are single-use and expire in 24 hours. approve.js must
check both the token validity AND the expiry timestamp before updating any status.

---

## Environment variables

All required variables are in .env.example. Copy it to .env and fill in real values.
Never commit .env to git. Share real values with teammates via a private message, not GitHub.

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
SCHEDULER_SECRET=
TOKEN_EXPIRY_HOURS=24
APP_URL=
```

---

## How to start your session

1. Pull the latest repo: git pull origin main
2. Paste this entire file as your first AI message
3. Tell the AI: "I am Person [2/3]. Read docs/RULES.md, then docs/HANDOFF_[N-1].md,
   then start Phase [N]. My owned files are [list from above]."
4. Let the AI read the referenced docs before writing any code
5. At end of session: write HANDOFF doc, commit, push

---

## When things go wrong

| Situation                          | What to do                                              |
|------------------------------------|---------------------------------------------------------|
| Bug in another person's files      | Document in your HANDOFF. Message that person. Don't fix. |
| Need a DB column that doesn't exist| Stop. Add to HANDOFF under "Schema Change Requests". Ask Shivesh. |
| Session limit hit mid-task         | Write a partial HANDOFF immediately. Mark TODOs clearly. |
| Unsure about an API shape          | Check src/shared/api.js — it's the source of truth.    |
| Dependency conflict or missing pkg | Document in HANDOFF under "Blockers". Don't workaround silently. |
