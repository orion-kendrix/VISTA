# HANDOFF_1.md — Phase 1: Frontend Widget Complete
> Written by: Claude Fable 5 (claude.ai)
> Date: 2026-06-12
> Phase: 1
> Status: Complete

---

## What Was Built

The complete FAB widget: a floating action button pinned bottom-right that
opens a sliding 4-step panel — Upload → Questions → Preview → Schedule.
Vanilla JS, ES modules, zero framework dependencies, fully functional with
mock data (set `window.VISTA_USE_MOCKS = true`) so it satisfies R5
independently of any backend.

The design follows the Vortex visual language: near-black ground, purple
(`--v-purple`) CTAs, cyan (`--v-blue`) informational accents, plus three
signature touches — a rotating conic-gradient ring around the FAB, a
glass-blur panel with a gradient border, and an SVG stroke-draw success
animation. Every colour in the codebase lives in the `.vista-root` token
block in widget.css; nothing below it uses a raw hex value (verified by
script). All class names are `vista-` prefixed and the whole tree is scoped
under `.vista-root`, so embedding on Vortex cannot collide with host styles
in either direction.

UX decisions worth knowing: the Questions step needs only 3 of 5 answers to
proceed (more answers = better post, enforced gently with a hint, not a
wall); the Settings step puts schedule + WhatsApp first, the three primary
voice settings as tappable chips, and the remaining eight settings in a
collapsible "Fine-tune" section so first-time users see five controls, not
twelve; and because the post is generated in Step 3 with the settings as
they were at that moment, changing settings in Step 4 marks the draft
visibly stale and offers a one-tap Regenerate — settings changes are never
silently ignored.

## File Map

```
src/widget/
  widget.css              — All tokens + every component style, vista- scoped
  FABWidget.js            — Root: FAB, panel shell, open/close, mount modes
  MultiStepForm.js        — State container, step router, stepper, success view
  steps/Step1Upload.js    — Drag-drop, CDN compression + canvas fallback
  steps/Step2Questions.js — analyzeImage() call, skeleton loader, 5 cards
  steps/Step3Preview.js   — generatePost() call, LinkedIn card, inline edit
  steps/Step4Settings.js  — Chips from constants.js, schedule, submit
  index.html              — Standalone test page (mock + ?live modes)
src/shared/
  api.js                  — UPDATED: real fetch + mock mode (see HANDOFF_2)
```

## API Contracts (what the widget calls)

Unchanged frozen signatures from Phase 0 planning:

```
analyzeImage(imageBase64, mimeType)        → { questions: string[5] }
generatePost(questions, answers, settings) → { postText: string }
schedulePost(payload)                      → { postQueueId, status,
                                               whatsappDelivered?, approveUrl? }
initiateLinkedInAuth()                     → browser navigation (no return)
```

`whatsappDelivered`/`approveUrl` are additive fields (see HANDOFF_2) — the
widget renders a manual approval link when WhatsApp delivery fails.

## Decisions Made

| Decision | Reason |
|----------|--------|
| Scoped class prefix instead of Shadow DOM | Keeps widget.css a plain stylesheet per the architecture spec and stays debuggable for the team; Shadow DOM is the documented hardening path if Vortex styles ever leak in. |
| Canvas compression fallback behind the CDN library | The CDN can be blocked by host CSP; the widget must never dead-end on upload. Which path ran is logged, never silent (R8). |
| Min 3 of 5 answers to proceed | Posts from 1-2 answers were generic; demanding all 5 added friction. 3 is the tested sweet spot. |
| Settings → stale-draft → Regenerate pattern | Step order is frozen (Upload→Questions→Preview→Settings) but the post is generated at Step 3; this makes Step 4 settings changes honest instead of silently inert. |
| `prefers-reduced-motion` kill-switch in CSS | Accessibility; all animation is decorative. |

## Known Rough Edges

- [ ] PDF uploads show a 📄 placeholder instead of a rendered first page.
- [ ] LinkedIn preview avatar is a generic "in" tile — real name/photo would
      need profile data the widget doesn't hold pre-OAuth.
- [ ] No drag-folder handling; single file only. Fine for MVP.

## Bugs Found in Other Layers
- None.

## Schema Change Requests
- None from this phase.

## What the Next Phase Should Do First

> Run `netlify dev`, open http://localhost:8888/src/widget/ and click through
> all four steps in mock mode. That is the reference behaviour the functions
> must reproduce in `?live` mode.
