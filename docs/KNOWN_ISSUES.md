# VISTA — Known Issues & Limitations
> Running log of known bugs and accepted MVP limitations (per docs/RULES.md,
> Phase 3 rules). Fixed items are struck through with the fixing phase noted.
> Last updated: 2026-06-12 (Phase 4 — bug-fix & hardening pass).

## Open — needs external action (not code)

- **LinkedIn app review required.** Publishing needs the "Share on LinkedIn"
  and "Sign In with LinkedIn using OpenID Connect" products added to the app
  in the LinkedIn Developer Portal. Until approved, `scheduler` publishes fail
  with 403 and posts are marked `failed`.
- **Function timeout is 10 s** (Netlify default; not configurable from
  `netlify.toml`). `gemini-2.5-flash` fits comfortably, but a slow LinkedIn
  publish batch could hit the ceiling — the batch size of 5 keeps this
  unlikely. Raise via the Netlify dashboard/support if it ever bites.

## Open — accepted MVP limitations

- **LinkedIn token refresh is not implemented.** When the ~60-day token dies,
  the session token dies with it (55-day TTL) and the user reconnects via the
  widget's auth gate.
- **CallMeBot is single-recipient.** A CallMeBot API key only delivers to the
  phone that registered it. Multi-user WhatsApp needs the
  `users.callmebot_key` schema change requested in HANDOFF_2. When the key is
  missing or delivery fails, the widget shows a manual approval link instead.
- **OAuth redirect loses in-progress widget state.** Hitting the auth gate
  mid-flow (e.g. at Schedule) navigates to LinkedIn and back; the upload,
  answers and draft are not restored. Workaround: connect LinkedIn first,
  then run the flow. Fix would need state persistence in localStorage.
- **PDFs are second-class.** No first-page render in the preview (📄
  placeholder), no client-side compression (large PDFs can exceed the
  analyze endpoint's ~2 MB cap and get a 413), and LinkedIn image attach
  falls back to text-only for PDF certificates.
- **A post stuck in `processing`** (crash between claim and publish/fail)
  needs a manual status reset in Supabase. The `post_queue.failure_reason`
  column requested in HANDOFF_2 would help triage.
- **No rate limiting on analyze/generate.** Fine while sessions are required;
  revisit before enabling `ALLOW_ANON_GENERATION=true` in production.
- **`seed.sql` is for local/dev only.** It contains an `approved` post with a
  fake LinkedIn token — a production scheduler will try to publish it, fail,
  and mark it `failed`. Don't run the seed against the production project
  (the deployment runbook in HANDOFF_2 lists it for completeness; skip it).
- **Success screen says "Link expires in 24 hours"** regardless of a custom
  `TOKEN_EXPIRY_HOURS`. Cosmetic; the server value is authoritative.

## Fixed in Phase 4 (2026-06-12)

- ~~`netlify.toml` declared per-function `timeout` keys~~ — not a supported
  config property; could fail deploy validation and was never honored. Removed.
- ~~`npm run test:functions` pointed at a missing script~~ —
  `scripts/test-functions.js` now exists (contract smoke test, no keys needed).
- ~~Country code not normalised to E.164~~ — typing `91` instead of `+91` in
  Step 4 caused a server 400 after submit. Now normalised client-side.
- ~~Post text over 3000 chars passed the client~~ — Step 3 now disables
  "Looks good" when an edited draft exceeds LinkedIn's limit.
- ~~Re-selecting the same file after an upload error did nothing~~ — the file
  input is now cleared after each pick so `change` always fires.
- ~~New upload left stale downstream steps reachable~~ — uploading or removing
  a certificate now locks the Preview/Schedule stepper pills again, so a post
  can't be generated from the previous certificate's answers.
- ~~`destroy()` leaked the document-level Escape listener; `panel.focus()` was
  a no-op~~ — listener is now unhooked; panel is focusable (`tabindex=-1`).
- ~~Non-JSON API errors surfaced as a bare status number~~ — friendlier
  message in `src/shared/api.js`.
- ~~Stepper clipped the "Schedule" label on wide system fonts~~ — found
  during browser verification (18px overflow on Segoe UI); spacing tightened
  in `widget.css`.
- ~~Stale root-level duplicates~~ — removed `api.js` (old Phase-1 stub with
  mocks hardcoded ON), `constants.js`, `RULES.md`, `ARCHITECTURE.md`,
  `HANDOFF_TEMPLATE.md`, `ANTIGRAVITY_PHASE0_PROMPT.md`, `HANDOFF_1/2.md`
  from the repo root. Canonical copies live in `docs/` and `src/shared/`.
