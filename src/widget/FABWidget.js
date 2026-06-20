// src/widget/FABWidget.js
// Root of the VISTA widget. Creates the FAB + panel shell, owns open/close
// state, and mounts the MultiStepForm inside the panel body.
//
// Usage:
//   import { initVistaWidget } from './FABWidget.js';
//   const vista = initVistaWidget();                       // floating FAB mode
//   const vista = initVistaWidget({ mode: 'inline', container: '#upload-tab' });
//
// Zero host-page configuration is required for FAB mode (RULES.md, Sonnet R3).

import { createMultiStepForm } from './MultiStepForm.js';
import { consumeSessionFromUrl } from '../shared/api.js';

const V_LOGO = `
  <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M5 7L14 21L23 7H18.5L14 15L9.5 7H5Z" fill="currentColor"/>
  </svg>`;

// "history" glyph (lucide) for the My Posts header button.
const HISTORY_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3 2"/>
  </svg>`;

export function initVistaWidget(options = {}) {
  const mode = options.mode === 'inline' ? 'inline' : 'fab';

  // Guard: never double-mount (embed.js may be included twice by accident).
  if (document.querySelector('.vista-root')) {
    console.warn('[VISTA] Widget already mounted — skipping second init.');
    return null;
  }

  // Pick up a #vista_session=... fragment left by the LinkedIn OAuth callback.
  // Done at mount so the session is stored before any step fires an API call.
  try {
    consumeSessionFromUrl();
  } catch (err) {
    console.error('[VISTA] Failed to read session from URL:', err);
  }

  const root = document.createElement('div');
  root.className = 'vista-root';
  root.dataset.mode = mode;

  // ── Panel shell ─────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'vista-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'VISTA — LinkedIn post agent');
  panel.setAttribute('tabindex', '-1'); // focusable so setOpen() can move focus in

  const header = document.createElement('div');
  header.className = 'vista-header';
  header.innerHTML = `
    <div class="vista-logo-tile" style="color: var(--v-text)">${V_LOGO}</div>
    <div class="vista-header-titles">
      <h2>VISTA</h2>
      <p data-vista-subtitle>Certificate → LinkedIn post</p>
    </div>`;

  // "My Posts" — opens the post-history side view. Wired after the form exists.
  const historyBtn = document.createElement('button');
  historyBtn.className = 'vista-history-btn';
  historyBtn.type = 'button';
  historyBtn.setAttribute('aria-label', 'My posts');
  historyBtn.setAttribute('title', 'My posts');
  historyBtn.innerHTML = HISTORY_ICON;
  header.appendChild(historyBtn);

  panel.appendChild(header);

  const body = document.createElement('div');

  // ── Mode wiring ─────────────────────────────────────────────────────────
  let fab = null;
  let isOpen = mode === 'inline'; // inline mode is always "open"
  let escHandler = null;          // kept so destroy() can unhook it

  function setOpen(next) {
    if (mode === 'inline') return; // inline can't be closed
    isOpen = next;
    panel.classList.toggle('vista-open', isOpen);
    if (fab) {
      fab.classList.toggle('vista-open', isOpen);
      fab.setAttribute('aria-expanded', String(isOpen));
    }
    if (isOpen) panel.focus?.();
  }

  if (mode === 'fab') {
    fab = document.createElement('button');
    fab.className = 'vista-fab';
    fab.setAttribute('aria-label', 'Open VISTA — LinkedIn post agent');
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = `<span style="color: var(--v-text); display:flex">${V_LOGO}</span>`;
    fab.addEventListener('click', () => setOpen(!isOpen));

    const closeBtn = document.createElement('button');
    closeBtn.className = 'vista-close';
    closeBtn.setAttribute('aria-label', 'Close VISTA');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => setOpen(false));
    header.appendChild(closeBtn);

    // Escape closes; clicks inside the panel never bubble out to host handlers.
    escHandler = (e) => {
      if (e.key === 'Escape' && isOpen) setOpen(false);
    };
    document.addEventListener('keydown', escHandler);

    root.appendChild(fab);
  } else {
    panel.classList.add('vista-open');
  }

  root.appendChild(panel);

  // ── Mount the form ──────────────────────────────────────────────────────
  const form = createMultiStepForm({
    onSubtitleChange(text) {
      const el = header.querySelector('[data-vista-subtitle]');
      if (el) el.textContent = text;
    },
  });
  panel.appendChild(form.el);

  // Header "My Posts" button opens the history side view (form owns the body).
  historyBtn.addEventListener('click', () => form.showPosts());

  // ── Attach to DOM ───────────────────────────────────────────────────────
  if (mode === 'inline') {
    const target =
      typeof options.container === 'string'
        ? document.querySelector(options.container)
        : options.container;
    if (!target) {
      console.error('[VISTA] inline mode: container not found:', options.container);
      return null;
    }
    target.appendChild(root);
  } else {
    document.body.appendChild(root);
  }

  return {
    root,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    reset: () => form.reset(),
    destroy: () => {
      if (escHandler) document.removeEventListener('keydown', escHandler);
      root.remove();
    },
  };
}
