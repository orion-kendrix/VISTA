# VISTA — Visual Intelligence & Smart Task Agent

A LinkedIn post scheduling agent. Upload a certificate → answer 5 AI-generated questions → get a tailored LinkedIn post → approve via WhatsApp → auto-publish.

## Project Structure

```
vista/
├── docs/               ← All AI collaboration docs (read these first)
├── supabase/           ← Database schema (owned by Opus)
├── netlify/functions/  ← Serverless backend (owned by Codex)
├── src/widget/         ← Frontend FAB widget (owned by Sonnet)
├── src/shared/         ← Shared contracts — frozen, do not edit
└── public/             ← Static assets
```

## Build Order

1. **Phase 0** — Opus writes the database schema (`supabase/`)
2. **Phase 1** — Sonnet builds the FAB widget (`src/widget/`)
3. **Phase 2** — Codex implements Netlify functions (`netlify/functions/`)
4. **Phase 3** — Opus wires everything together + writes `embed.js`

## For every AI working on this project

Read `docs/RULES.md` first. No exceptions.

## Setup

```bash
npm install
cp .env.example .env
# Fill in .env values
netlify dev
```
