# VISTA — Architecture Reference
> This document describes the full system architecture.
> It is written before any code and serves as the single source of truth for all AIs.
> Read this alongside RULES.md before starting any phase.

---

## What VISTA Does

VISTA is a LinkedIn post scheduling agent. Given a certificate or achievement image, it:
1. Extracts details from the image using Google Gemini Flash (vision)
2. Asks the user 5 personalised questions about the achievement
3. Generates a tailored LinkedIn post draft from their answers + micro-settings
4. Sends a WhatsApp preview for approval
5. Publishes the post to LinkedIn at the scheduled time

---

## Project Structure

```
vista/
├── docs/
│   ├── RULES.md                  ← Read first. Always.
│   ├── ARCHITECTURE.md           ← This file
│   ├── HANDOFF_TEMPLATE.md       ← Template for all handoff docs
│   ├── HANDOFF_0.md              ← Written by Opus after schema
│   ├── HANDOFF_1.md              ← Written by Sonnet after widget
│   ├── HANDOFF_2.md              ← Written by Codex after functions
│   └── KNOWN_ISSUES.md           ← Running log of known bugs
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql   ← FROZEN after Phase 0
│   │   └── 002_rls_policies.sql     ← FROZEN after Phase 0
│   └── seed.sql                     ← Test data for all UI states
│
├── netlify/
│   └── functions/
│       ├── _utils/
│       │   ├── supabaseClient.js    ← ALL DB access goes here
│       │   ├── linkedinClient.js    ← ALL LinkedIn API calls go here
│       │   └── tokenSecurity.js     ← Token generation + validation
│       ├── callback.js              ← LinkedIn OAuth token exchange
│       ├── analyze-questions.js     ← Image → 5 questions (Gemini)
│       ├── generate-post.js         ← Answers + settings → post draft (Gemini)
│       ├── schedule-whatsapp.js     ← Creates approval token, pings WhatsApp
│       ├── approve.js               ← Processes approve/reject tap
│       └── scheduler.js            ← Cron-triggered publisher
│
├── src/
│   ├── shared/
│   │   ├── api.js                   ← Fetch wrappers + stubs (Sonnet writes stubs, Codex replaces with real)
│   │   └── constants.js             ← Shared enums: step names, micro-setting keys, post statuses
│   │
│   └── widget/
│       ├── FABWidget.js             ← Root component, toggle logic
│       ├── MultiStepForm.js         ← Step router + shared state
│       ├── steps/
│       │   ├── Step1Upload.js       ← Drag-and-drop + compression
│       │   ├── Step2Questions.js    ← Dynamic question render
│       │   ├── Step3Preview.js      ← Side-by-side preview panel
│       │   └── Step4Settings.js    ← Micro-settings + schedule inputs
│       ├── widget.css               ← All styles (CSS variables only, no hardcoded hex)
│       ├── index.html               ← Standalone test page
│       └── embed.js                 ← Single <script> tag for external embedding (Opus writes this)
│
├── public/
│   └── vista-logo.svg
│
├── .env.example                     ← Canonical env var list (Opus maintains)
├── netlify.toml                     ← Routing, function config (Opus writes)
├── package.json
└── README.md
```

---

## Database Schema (Canonical Reference)

> The actual SQL lives in `supabase/migrations/`. This section is a human-readable summary.

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Supabase auth user ID |
| linkedin_id | TEXT UNIQUE | LinkedIn member ID |
| access_token | TEXT | Encrypted LinkedIn OAuth token |
| token_expires_at | TIMESTAMPTZ | Token validity window (LinkedIn tokens last ~60 days) |
| whatsapp_number | TEXT | E.164 format e.g. +919876543210 |
| created_at | TIMESTAMPTZ | Default NOW() |

### `post_queue`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users.id | ON DELETE CASCADE |
| post_text | TEXT | Generated LinkedIn post content |
| image_url | TEXT | Stored certificate image URL |
| scheduled_at | TIMESTAMPTZ | When to publish |
| status | TEXT ENUM | `draft` → `pending_approval` → `approved` / `rejected` → `processing` → `published` / `failed` |
| approval_token | TEXT UNIQUE | One-time WhatsApp approval token |
| token_expires_at | TIMESTAMPTZ | 24 hours from creation |
| micro_settings | JSONB | All 11 micro-settings as a JSON object |
| linkedin_post_id | TEXT | Populated after successful publish |
| created_at | TIMESTAMPTZ | Default NOW() |
| published_at | TIMESTAMPTZ | Populated after successful publish |

### `questionnaire_responses`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| post_queue_id | UUID FK → post_queue.id | ON DELETE CASCADE |
| questions | JSONB | Array of 5 question strings |
| answers | JSONB | Array of 5 answer strings, index-matched to questions |
| created_at | TIMESTAMPTZ | Default NOW() |

---

## API Surface (Function Endpoints)

All functions live at `/.netlify/functions/[name]`

| Function | Method | Auth Required | Purpose |
|----------|--------|---------------|---------|
| `callback` | GET | No | LinkedIn OAuth redirect handler |
| `analyze-questions` | POST | Yes (session) | Image → 5 questions |
| `generate-post` | POST | Yes (session) | Answers + settings → post draft |
| `schedule-whatsapp` | POST | Yes (session) | Save post, send WhatsApp |
| `approve` | GET | Token in URL | Approve or reject post |
| `scheduler` | POST | Secret header | Cron trigger — publish due posts |

---

## Micro-Settings Reference

These 11 settings are stored as a JSONB object in `post_queue.micro_settings`.
Keys are defined in `src/shared/constants.js`.

| Key | Type | Options |
|-----|------|---------|
| `tone` | enum | `professional`, `casual`, `inspirational`, `humble` |
| `length` | enum | `short` (150w), `medium` (250w), `long` (400w) |
| `industry` | string | Free text |
| `language` | enum | `english`, `hindi`, `hinglish` |
| `emojiDensity` | enum | `none`, `low`, `medium`, `high` |
| `hookStyle` | enum | `question`, `boldStatement`, `statistic`, `storyOpener` |
| `hashtagCount` | number | 0 – 10 |
| `callToAction` | boolean | Include CTA at end? |
| `credentialFocus` | enum | `skills`, `journey`, `gratitude`, `impact` |
| `audienceTarget` | enum | `recruiters`, `peers`, `general`, `clients` |
| `firstPerson` | boolean | Use "I" voice vs third-person |

---

## Post Status State Machine

```
draft
  └─► pending_approval   (after schedule-whatsapp runs)
        ├─► approved      (user taps Approve on WhatsApp)
        │     └─► processing  (scheduler picks it up)
        │               ├─► published   (LinkedIn API success)
        │               └─► failed      (LinkedIn API error)
        └─► rejected      (user taps Reject on WhatsApp)
```

---

## Technology Stack

| Concern | Choice | Reason |
|---------|--------|--------|
| Frontend | Vanilla JS (no framework) | Embeddable in any host site without dependency conflicts |
| Hosting | Netlify | Free tier, serverless functions, easy deploy |
| Database | Supabase (PostgreSQL) | Free tier, built-in auth, RLS, realtime if needed |
| Vision AI | Google Gemini Flash | Multimodal, fast, cheap per token |
| WhatsApp | CallMeBot | Zero cost, good enough for MVP |
| Image compression | browser-image-compression (CDN) | Client-side, no server cost |
| LinkedIn OAuth | LinkedIn OAuth 2.0 | Required for posting on behalf of user |

---

## Environment Variables (Full List)

All of these must exist in `.env.example`. Never commit real values.

```
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Google Gemini
GEMINI_API_KEY=

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=

# Security
SCHEDULER_SECRET=          # Header secret to prevent public cron triggers
TOKEN_EXPIRY_HOURS=24      # Approval token lifetime

# App
APP_URL=                   # e.g. https://vista.netlify.app
```

---

## Integration with Vortex Website

VISTA integrates into the Vortex website (built by Shivesh's friend) via a single script tag:

```html
<script src="https://vista.netlify.app/widget/embed.js"></script>
```

This mounts the FAB widget on any page with zero configuration.
For the profile page Upload Tab embed, pass a data attribute:

```html
<script src="https://vista.netlify.app/widget/embed.js" data-mode="inline" data-container="#upload-tab"></script>
```

`embed.js` is written by Opus in Phase 3. Do not attempt to create it earlier.

---

*This document is the architectural contract for all phases of VISTA.*
*Do not modify it without Shivesh's approval.*
