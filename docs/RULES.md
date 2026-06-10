# VISTA — AI Collaboration Rules
> This file is the law. Every AI working on this project must read this before writing a single line of code.
> Do not modify this file. Do not reinterpret it. Follow it exactly.

---

## The Prime Directive

**One AI owns one layer. You do not touch what you do not own.**

If you find a bug in another AI's layer, you document it in your HANDOFF file and move on.
You do not fix it. You do not refactor it. You do not "just clean it up a little."
The human (Shivesh) decides when and whether to address cross-layer issues.

---

## Layer Ownership Map

| Layer | Owner | Root Folders |
|-------|-------|-------------|
| Database Schema | Claude Opus 4.8 (Antigravity) | `supabase/` |
| Serverless Functions | Codex | `netlify/functions/` |
| Frontend Widget | Claude Sonnet 4.6 (Claude.ai) | `src/widget/`, `src/shared/` |
| Integration & Hardening | Claude Opus 4.8 (Antigravity) | `src/widget/embed.js`, `netlify.toml`, `.env.example` |

---

## Universal Rules (Apply to ALL AIs)

### R1 — Read before you write
Before writing any code, read:
1. This file (`docs/RULES.md`)
2. The most recent HANDOFF file in `docs/`
3. `docs/ARCHITECTURE.md`
4. Every file in your owned layer

If you skip this step, you will duplicate work or break contracts.

### R2 — Never touch files outside your layer
Your owned folders are listed in the ownership map above.
Everything else is read-only for context. You may `import` from shared files. You may not edit them unless they are explicitly in your ownership list.

### R3 — Never change the database schema after Phase 1
`supabase/migrations/001_initial_schema.sql` is frozen the moment Opus writes it.
If you believe a schema change is needed, document it clearly in your HANDOFF file under a `## Schema Change Requests` section and stop. Do not make the change yourself.

### R4 — Never hardcode secrets or configuration
No API keys. No connection strings. No hardcoded URLs.
All configuration comes from environment variables listed in `.env.example`.
If you need a new env variable, add it to `.env.example` with a comment explaining what it is.

### R5 — Every function must be independently testable
- Widget steps must work with mock data from `src/shared/api.js`
- Netlify functions must return correct responses when called with `curl` in isolation
- The embed script must mount the widget on a blank HTML page

If your code only works when the entire system is running, it is too tightly coupled. Fix it.

### R6 — Write the handoff document before you stop
When you finish your phase (or when you hit a token/session limit mid-phase):
1. Stop writing feature code
2. Write your HANDOFF file (see template in `docs/HANDOFF_TEMPLATE.md`)
3. Commit everything with the message: `phase-[N]: handoff ready`

A half-finished feature with a complete handoff document is better than a finished feature with no documentation.

### R7 — Name things consistently
Follow the naming conventions established in `src/shared/constants.js`.
- Database columns: `snake_case`
- JavaScript variables and functions: `camelCase`
- File names: `kebab-case` for CSS and HTML, `camelCase.js` for JavaScript modules
- Environment variables: `SCREAMING_SNAKE_CASE`

If you see inconsistency in your own layer, fix it. If you see it in another layer, document it in your HANDOFF file.

### R8 — No silent failures
Every async operation must have a `try/catch`.
Every caught error must be logged with enough context to debug it.
Never swallow an error silently. Never `catch(e) {}` with an empty block.

### R9 — Do not invent new dependencies without justification
Before adding an `npm` package:
1. Check if the task can be done with what is already installed
2. If a new package is genuinely needed, add it to `package.json` and document WHY in your HANDOFF file
3. Prefer packages that are already in the project over introducing new ones

### R10 — Comments explain WHY, not WHAT
Bad: `// loop through users`
Good: `// LinkedIn API rejects batch publishes, so we process the queue one post at a time`

---

## Phase-Specific Rules

### Opus (Phase 0 — Schema)
- Write the schema FIRST, before any other phase begins
- Every table must have `created_at TIMESTAMPTZ DEFAULT NOW()`
- Every foreign key must have an explicit `ON DELETE` behaviour — no implicit defaults
- RLS (Row Level Security) must be enabled on every table
- Write `supabase/seed.sql` with enough test data to cover every UI state (empty, loading, error, success)

### Sonnet (Phase 1 — Widget)
- All API calls go through stub functions in `src/shared/api.js`
- Stubs must return data shaped exactly as the real API will return — ask Opus for the schema first
- The widget must be embeddable with a single `<script>` tag and zero configuration from the host page
- No framework dependencies — vanilla JS only
- CSS must use only the CSS variables defined in `src/widget/widget.css` — no hardcoded hex colours

### Codex (Phase 2 — Functions)
- Read `HANDOFF_1.md` completely before writing any function
- The stub signatures in `src/shared/api.js` are your API contract — implement exactly those endpoints
- All Supabase access goes through `netlify/functions/_utils/supabaseClient.js` — never call Supabase directly from a function file
- The `scheduler.js` function must set post status to `processing` BEFORE attempting to publish — this prevents double-publishing on retry
- Approval tokens must be single-use and expire in 24 hours

### Opus (Phase 3 — Integration)
- Read `HANDOFF_1.md` and `HANDOFF_2.md` before writing anything
- Your job is to wire and harden, not to rewrite
- `embed.js` must be the ONLY new file in `src/widget/` — do not touch any other widget file
- After integration, run the full flow manually and document any bugs found in `docs/KNOWN_ISSUES.md` rather than silently patching them

---

## What to Do When Things Go Wrong

| Situation | Action |
|-----------|--------|
| You find a bug in another AI's layer | Document in HANDOFF file under `## Bugs Found in Other Layers`. Do not fix. |
| You need data from a table that doesn't exist | Stop. Add a `## Schema Change Requests` section to your HANDOFF file. Do not create the table yourself. |
| You hit a token limit mid-feature | Write a partial HANDOFF immediately. Mark incomplete sections clearly with `<!-- TODO: incomplete -->` |
| A dependency is broken or missing | Document in HANDOFF under `## Blockers`. Do not work around it silently. |
| You disagree with an architectural decision | Note it in `## Architectural Concerns` in your HANDOFF. Do not unilaterally change it. |

---

## The Handoff Protocol

Every phase transition requires a handoff document at `docs/HANDOFF_[N].md`.
Use the template at `docs/HANDOFF_TEMPLATE.md`.

The next AI reads the handoff document BEFORE reading any code.
The handoff document is the source of truth. If code and the handoff document disagree, flag it — do not silently resolve it.

---

*This file was written by Claude Sonnet 4.6 and applies to all AI agents on the VISTA project.*
*Last updated: Phase 0 setup*
