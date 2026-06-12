// src/widget/steps/Step4Settings.js
// Schedule + WhatsApp inputs first (the critical path), then the 11
// micro-settings — primary ones as chip groups, the rest in a collapsible
// "Fine-tune" section. Every option list is rendered from constants.js
// (RULES.md, Sonnet rules: never hardcode the enums here).
//
// Flow note: the post was generated in Step 3 with the settings current at
// that time. Changing settings here marks the draft stale and offers a
// one-tap "Regenerate" that re-runs generatePost with the new settings.

import {
  MICRO_SETTINGS_KEYS as K,
  TONE_OPTIONS, LENGTH_OPTIONS, LANGUAGE_OPTIONS, EMOJI_DENSITY_OPTIONS,
  HOOK_STYLE_OPTIONS, CREDENTIAL_FOCUS_OPTIONS, AUDIENCE_TARGET_OPTIONS,
} from '../../shared/constants.js';
import { generatePost, schedulePost, initiateLinkedInAuth, AuthRequiredError } from '../../shared/api.js';

export function createStep4Settings(ctx) {
  const el = document.createElement('div');

  function render() {
    const s = ctx.state.microSettings;
    el.innerHTML = '';

    // ── Post snapshot + regenerate ──────────────────────────────────────────
    const snap = document.createElement('div');
    snap.className = 'vista-snapshot' + (ctx.state.postStale ? ' vista-stale' : '');
    snap.innerHTML = `
      <p>${escapeHtml(ctx.state.postText.slice(0, 140))}…</p>
      <button type="button" data-slot="regen">↻ Regenerate</button>`;
    el.appendChild(snap);

    // ── Schedule & notify (most important — goes first) ─────────────────────
    el.appendChild(section('When & where', [
      field('Publish date & time', `
        <input class="vista-input" type="datetime-local" data-slot="dt"
               value="${ctx.state.scheduledAt}" min="${nowLocalISO()}" />`),
      field('WhatsApp number (for approval)', `
        <div class="vista-phone-row">
          <input class="vista-input vista-cc" data-slot="cc" value="${escapeHtml(ctx.state.whatsappCc)}" aria-label="Country code" />
          <input class="vista-input vista-num" data-slot="phone" type="tel" inputmode="numeric"
                 placeholder="9876543210" value="${escapeHtml(ctx.state.whatsappNumber)}" aria-label="Phone number" />
        </div>`),
    ]));

    // ── Primary voice settings — chips ──────────────────────────────────────
    el.appendChild(section('Voice', [
      chipGroup('Tone', TONE_OPTIONS, s[K.TONE], (v) => pick(K.TONE, v)),
      chipGroup('Length', LENGTH_OPTIONS, s[K.LENGTH], (v) => pick(K.LENGTH, v),
        { short: 'Short ~150w', medium: 'Medium ~250w', long: 'Long ~400w' }),
      chipGroup('Language', LANGUAGE_OPTIONS, s[K.LANGUAGE], (v) => pick(K.LANGUAGE, v)),
    ]));

    // ── Fine-tune (collapsible) ─────────────────────────────────────────────
    const adv = document.createElement('div');
    adv.className = 'vista-collapse';
    adv.dataset.open = 'false';
    adv.innerHTML = `
      <button type="button" class="vista-collapse-head">
        <span>Fine-tune (hook, emoji, audience…)</span><span class="vista-caret">▼</span>
      </button>
      <div class="vista-collapse-body"></div>`;
    adv.querySelector('.vista-collapse-head').addEventListener('click', () => {
      adv.dataset.open = adv.dataset.open === 'true' ? 'false' : 'true';
    });
    const advBody = adv.querySelector('.vista-collapse-body');
    advBody.appendChild(chipGroup('Hook style', HOOK_STYLE_OPTIONS, s[K.HOOK_STYLE], (v) => pick(K.HOOK_STYLE, v)));
    advBody.appendChild(chipGroup('Emoji density', EMOJI_DENSITY_OPTIONS, s[K.EMOJI_DENSITY], (v) => pick(K.EMOJI_DENSITY, v)));
    advBody.appendChild(chipGroup('Focus on', CREDENTIAL_FOCUS_OPTIONS, s[K.CREDENTIAL_FOCUS], (v) => pick(K.CREDENTIAL_FOCUS, v)));
    advBody.appendChild(chipGroup('Audience', AUDIENCE_TARGET_OPTIONS, s[K.AUDIENCE_TARGET], (v) => pick(K.AUDIENCE_TARGET, v)));
    advBody.appendChild(field('Industry (optional)', `
      <input class="vista-input" data-slot="industry" placeholder="e.g. Cloud, Analytics"
             value="${escapeHtml(s[K.INDUSTRY] || '')}" />`));
    advBody.appendChild(field(`Hashtags`, `
      <div class="vista-slider-row">
        <input class="vista-range" type="range" min="0" max="10" value="${s[K.HASHTAG_COUNT]}" data-slot="hashtags" />
        <output data-slot="hashout">${s[K.HASHTAG_COUNT]}</output>
      </div>`));
    const toggles = document.createElement('div');
    toggles.className = 'vista-grid-2';
    toggles.appendChild(toggle('Call to action', s[K.CALL_TO_ACTION], (v) => pick(K.CALL_TO_ACTION, v)));
    toggles.appendChild(toggle('First-person "I"', s[K.FIRST_PERSON], (v) => pick(K.FIRST_PERSON, v)));
    advBody.appendChild(toggles);
    el.appendChild(adv);

    // ── Submit ──────────────────────────────────────────────────────────────
    const row = document.createElement('div');
    row.className = 'vista-btn-row';
    row.innerHTML = `
      <button class="vista-btn vista-btn-secondary" data-slot="back">←</button>
      <button class="vista-btn vista-btn-primary" data-slot="submit">Send for approval →</button>`;
    el.appendChild(row);

    const note = document.createElement('p');
    note.className = 'vista-hint';
    note.textContent = 'You approve on WhatsApp before anything is published.';
    el.appendChild(note);

    // ── Wiring ─────────────────────────────────────────────────────────────
    el.querySelector('[data-slot="regen"]').addEventListener('click', regenerate);
    el.querySelector('[data-slot="dt"]').addEventListener('change', (e) => ctx.setState({ scheduledAt: e.target.value }));
    el.querySelector('[data-slot="cc"]').addEventListener('input', (e) => ctx.setState({ whatsappCc: e.target.value.trim() }));
    el.querySelector('[data-slot="phone"]').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
      ctx.setState({ whatsappNumber: e.target.value });
    });
    el.querySelector('[data-slot="industry"]').addEventListener('input', (e) => pick(K.INDUSTRY, e.target.value, { quiet: true }));
    const range = el.querySelector('[data-slot="hashtags"]');
    range.addEventListener('input', () => {
      el.querySelector('[data-slot="hashout"]').textContent = range.value;
      pick(K.HASHTAG_COUNT, Number(range.value), { quiet: true });
    });
    range.addEventListener('change', () => markStale());
    el.querySelector('[data-slot="back"]').addEventListener('click', ctx.goBack);
    el.querySelector('[data-slot="submit"]').addEventListener('click', submit);
  }

  // Settings changes after generation make the draft stale — visibly, never silently.
  function pick(key, value, opts = {}) {
    ctx.state.microSettings[key] = value;
    if (!opts.quiet) markStale();
    // chips re-render for selection state; quiet inputs (text/slider) don't
    if (!opts.quiet) render();
  }
  function markStale() {
    if (ctx.state.postText) {
      ctx.setState({ postStale: true });
      el.querySelector('.vista-snapshot')?.classList.add('vista-stale');
    }
  }

  async function regenerate() {
    const btn = el.querySelector('[data-slot="regen"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="vista-spinner" style="width:11px;height:11px"></span> Writing…';
    try {
      const { questions, answers, microSettings } = ctx.state;
      const { postText } = await generatePost(questions, answers, microSettings);
      ctx.setState({ postText, postStale: false });
      render();
    } catch (err) {
      console.error('[VISTA] regenerate failed:', err);
      btn.disabled = false;
      btn.textContent = '↻ Retry';
    }
  }

  async function submit() {
    const phoneEl = el.querySelector('[data-slot="phone"]');
    const dtEl = el.querySelector('[data-slot="dt"]');
    const btn = el.querySelector('[data-slot="submit"]');

    const phone = ctx.state.whatsappNumber;
    if (!/^\d{8,14}$/.test(phone)) return flagInvalid(phoneEl);
    if (!ctx.state.scheduledAt || new Date(ctx.state.scheduledAt) < new Date(Date.now() + 2 * 60 * 1000)) {
      return flagInvalid(dtEl);
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="vista-spinner"></span> Saving & pinging WhatsApp…';

    try {
      const result = await schedulePost({
        postText: ctx.state.postText,
        imageBase64: ctx.state.image?.base64 || null,
        imageMimeType: ctx.state.image?.mimeType || null,
        whatsappNumber: `${ctx.state.whatsappCc}${phone}`,
        scheduledAt: new Date(ctx.state.scheduledAt).toISOString(),
        microSettings: ctx.state.microSettings,
        questions: ctx.state.questions,
        answers: ctx.state.answers,
      });
      ctx.showSuccess(result);
    } catch (err) {
      console.error('[VISTA] schedule failed:', err);
      btn.disabled = false;
      btn.textContent = 'Send for approval →';
      if (err instanceof AuthRequiredError) return renderAuthGate();
      showErrorBanner(err.message || 'Could not save the post. Try again.');
    }
  }

  function renderAuthGate() {
    el.innerHTML = `
      <div class="vista-auth-gate">
        <h4>Connect LinkedIn to schedule</h4>
        <p>VISTA publishes on your behalf, so it needs your LinkedIn connection before scheduling.</p>
        <button class="vista-btn vista-btn-primary" data-slot="auth">Connect LinkedIn</button>
      </div>
      <div class="vista-btn-row">
        <button class="vista-btn vista-btn-secondary" data-slot="back" style="flex:1">← Back</button>
      </div>`;
    el.querySelector('[data-slot="auth"]').addEventListener('click', () => initiateLinkedInAuth());
    el.querySelector('[data-slot="back"]').addEventListener('click', () => { render(); });
  }

  function showErrorBanner(msg) {
    el.querySelector('.vista-error')?.remove();
    const banner = document.createElement('div');
    banner.className = 'vista-error';
    banner.innerHTML = `<div><b>Couldn't schedule</b>${escapeHtml(msg)}</div>`;
    el.prepend(banner);
    el.scrollIntoView?.({ block: 'start' });
  }

  function flagInvalid(input) {
    input.focus();
    input.style.borderColor = 'var(--v-red)';
    setTimeout(() => (input.style.borderColor = ''), 1800);
  }

  // ── tiny builders ──────────────────────────────────────────────────────────
  function section(label, children) {
    const sec = document.createElement('div');
    sec.className = 'vista-section';
    sec.innerHTML = `<div class="vista-section-label">${label}</div>`;
    children.forEach((c) => sec.appendChild(c));
    return sec;
  }
  function field(label, innerHtml) {
    const f = document.createElement('div');
    f.className = 'vista-field';
    f.innerHTML = `<div class="vista-field-label">${label}</div>${innerHtml}`;
    return f;
  }
  function chipGroup(label, options, current, onPick, labelMap = {}) {
    const f = document.createElement('div');
    f.className = 'vista-field';
    f.innerHTML = `<div class="vista-field-label">${label}</div>`;
    const wrap = document.createElement('div');
    wrap.className = 'vista-chips';
    options.forEach((opt) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'vista-chip' + (opt === current ? ' vista-on' : '');
      chip.textContent = labelMap[opt] || pretty(opt);
      chip.addEventListener('click', () => onPick(opt));
      wrap.appendChild(chip);
    });
    f.appendChild(wrap);
    return f;
  }
  function toggle(label, value, onChange) {
    const row = document.createElement('div');
    row.className = 'vista-toggle-row';
    row.innerHTML = `<span>${label}</span><button type="button" class="vista-switch${value ? ' vista-on' : ''}" role="switch" aria-checked="${value}"></button>`;
    const sw = row.querySelector('.vista-switch');
    sw.addEventListener('click', () => {
      const next = !sw.classList.contains('vista-on');
      sw.classList.toggle('vista-on', next);
      sw.setAttribute('aria-checked', String(next));
      onChange(next);
    });
    return row;
  }

  return { el, onEnter: render, onReset() { el.innerHTML = ''; } };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function pretty(v) {
  // camelCase enum → "Camel case" label (boldStatement → Bold statement)
  const spaced = String(v).replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
function nowLocalISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
