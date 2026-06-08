# HANDOFF_[N].md — Phase [Name] Complete
> Written by: [AI Name + Model]
> Date: [Date]
> Phase: [0 / 1 / 2 / 3]
> Status: [Complete / Partial — explain if partial]

---

## What Was Built

A plain-English summary of everything completed in this phase.
No bullet-point laundry lists — write it as if briefing a new developer joining the project.

---

## File Map

Every file created or modified in this phase, with a one-line description of its purpose.

```
src/
  widget/
    FABWidget.js          — Main toggle container, manages open/close state
    MultiStepForm.js      — Step router, holds all step state
    ...
```

---

## API Contracts

### Endpoints implemented (or stubbed) this phase

For each endpoint, document:

```
POST /api/analyze-questions
  Request:  { image: base64string, mimeType: string }
  Response: { questions: string[] }  // always exactly 5 items
  Errors:   400 if image missing, 500 if Gemini call fails
```

---

## Environment Variables

Any new environment variables introduced this phase.
Copy-paste ready for `.env.example`.

```
GEMINI_API_KEY=          # Google AI Studio key, get from aistudio.google.com
SUPABASE_URL=            # Project URL from Supabase dashboard > Settings > API
```

---

## Decisions Made

Document every non-obvious decision and the reason behind it.
The next AI needs to understand WHY, not just WHAT.

| Decision | Reason |
|----------|--------|
| Used browser-image-compression instead of sharp | Sharp requires native binaries, breaks on Netlify. CDN library works client-side with zero server cost. |
| Approval token expiry set to 24 hours | Long enough for timezone differences, short enough to limit security exposure. |

---

## Known Rough Edges

Things that work but could be better. The next AI should be aware but NOT fix unless it blocks their work.

- [ ] Drag-and-drop doesn't handle folders, only files. Acceptable for MVP.
- [ ] Error messages are generic — could be more specific per step.

---

## Bugs Found in Other Layers

Document bugs you spotted in other AI's layers. Do NOT fix them.

- None found. / [Description of bug, file, line number if possible]

---

## Schema Change Requests

Only fill this section if you need a table or column that doesn't exist yet.
Do NOT create it yourself — Opus handles schema changes.

- None needed. / [Describe what you need and why]

---

## Blockers

Things that stopped or slowed this phase that the next phase needs to resolve.

- None. / [Description of blocker]

---

## Architectural Concerns

Disagreements or concerns about decisions made in this or earlier phases.
These are notes for Shivesh — do not act on them unilaterally.

- None. / [Description of concern]

---

## What the Next Phase Should Do First

The single most important thing the next AI should do before writing any code.

> Example: "Run `netlify dev` and verify all 6 function stubs return 200 before replacing them with real implementations."

---

## Prompt for the Next AI

A copy-paste ready paragraph to paste at the start of the next session.

> "You are working on VISTA, a LinkedIn post scheduling agent. You are [Codex / Opus]. 
> Your job is Phase [N]: [description].
> Read docs/RULES.md, then docs/HANDOFF_[N-1].md, then docs/ARCHITECTURE.md before writing anything.
> Your owned files are: [list].
> Do not touch: [list].
> Start by [first action]."
