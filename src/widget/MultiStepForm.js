// src/widget/MultiStepForm.js
// The step router and single source of truth for widget state.
// Steps never talk to each other directly — they read/write state through the
// ctx object handed to them here, which keeps each step independently
// testable (RULES.md R5).

import { STEPS, MICRO_SETTINGS_DEFAULTS } from '../shared/constants.js';
import { createStep1Upload } from './steps/Step1Upload.js';
import { createStep2Questions } from './steps/Step2Questions.js';
import { createStep3Preview } from './steps/Step3Preview.js';
import { createStep4Settings } from './steps/Step4Settings.js';
import { createPostHistory } from './PostHistory.js';

const STEP_ORDER = [STEPS.UPLOAD, STEPS.QUESTIONS, STEPS.PREVIEW, STEPS.SETTINGS];
const STEP_LABELS = { upload: 'Upload', questions: 'Questions', preview: 'Preview', settings: 'Schedule' };

export function createMultiStepForm({ onSubtitleChange } = {}) {
  // ── State ────────────────────────────────────────────────────────────────
  const state = {
    step: STEPS.UPLOAD,
    maxReachedIndex: 0,
    image: null,            // { base64, mimeType, dataUrl, name, sizeKB, isPdf }
    questions: [],
    answers: ['', '', '', '', ''],
    postText: '',
    postStale: false,       // true when settings changed after generation
    answersDirty: false,    // true when answers/questions changed after generation
    microSettings: { ...MICRO_SETTINGS_DEFAULTS },
    whatsappCc: '+91',
    whatsappNumber: '',
    email: '',
    saveToProfile: false,   // opt-in: also save the cert to the host profile
    certTitle: '',
    certIssuer: '',
    scheduledAt: defaultScheduleISO(),
  };

  function setState(patch) { Object.assign(state, patch); }

  // Held so returning from a side view (My Posts) restores the receipt instead
  // of dropping the user back on a live Schedule step, where "Send for
  // approval" would queue the very same post a second time.
  let lastSuccess = null;

  // ── Shell DOM ────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.style.cssText = 'display:flex;flex-direction:column;min-height:0;flex:1;';

  const stepper = document.createElement('div');
  stepper.className = 'vista-stepper';

  const body = document.createElement('div');
  body.className = 'vista-body';

  el.appendChild(stepper);
  el.appendChild(body);

  // ── Navigation ───────────────────────────────────────────────────────────
  function indexOf(stepId) { return STEP_ORDER.indexOf(stepId); }

  function goTo(stepId) {
    const idx = indexOf(stepId);
    if (idx < 0) return;
    // Forward jumps beyond the next unreached step are blocked; back-nav free.
    if (idx > state.maxReachedIndex + 1) return;
    lastSuccess = null; // stepping back into the flow retires the receipt
    state.step = stepId;
    state.maxReachedIndex = Math.max(state.maxReachedIndex, idx);
    render();
  }
  const goNext = () => goTo(STEP_ORDER[indexOf(state.step) + 1]);
  const goBack = () => goTo(STEP_ORDER[indexOf(state.step) - 1]);

  // ── Steps (created once, re-entered on navigation) ──────────────────────
  const ctx = { state, setState, goTo, goNext, goBack, showSuccess, refresh: render };
  const steps = {
    [STEPS.UPLOAD]:    createStep1Upload(ctx),
    [STEPS.QUESTIONS]: createStep2Questions(ctx),
    [STEPS.PREVIEW]:   createStep3Preview(ctx),
    [STEPS.SETTINGS]:  createStep4Settings(ctx),
  };

  // ── Render ───────────────────────────────────────────────────────────────
  function renderStepper() {
    stepper.innerHTML = '';
    const currentIdx = indexOf(state.step);

    STEP_ORDER.forEach((id, i) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'vista-step-pill';
      if (i === currentIdx) pill.classList.add('vista-active');
      if (i < currentIdx) pill.classList.add('vista-done');
      const reachable = i <= state.maxReachedIndex;
      pill.dataset.reachable = String(reachable);
      pill.innerHTML = `
        <span class="vista-step-dot">${i < currentIdx ? '✓' : i + 1}</span>
        <span>${STEP_LABELS[id]}</span>`;
      if (reachable) pill.addEventListener('click', () => goTo(id));
      stepper.appendChild(pill);

      if (i < STEP_ORDER.length - 1) {
        const conn = document.createElement('div');
        conn.className = 'vista-step-connector';
        if (i < currentIdx) conn.classList.add('vista-done');
        stepper.appendChild(conn);
      }
    });
  }

  function render() {
    renderStepper();
    onSubtitleChange?.(STEP_LABELS[state.step]);

    const step = steps[state.step];
    body.innerHTML = '';
    const view = document.createElement('div');
    view.className = 'vista-step-view';
    view.appendChild(step.el);
    body.appendChild(view);
    body.scrollTop = 0;
    step.onEnter?.();
  }

  // ── Success (terminal view after schedulePost succeeds) ─────────────────
  function showSuccess(result) {
    lastSuccess = result;
    stepper.style.display = 'none';
    onSubtitleChange?.('Scheduled');
    body.innerHTML = '';

    const when = state.scheduledAt
      ? new Date(state.scheduledAt).toLocaleString(undefined, {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        })
      : 'As soon as approved';
    const delivered = result.emailDelivered === true;
    const sentTo = state.email || '—';

    const wrap = document.createElement('div');
    wrap.className = 'vista-success';
    wrap.innerHTML = `
      <svg class="vista-success-ring" viewBox="0 0 68 68" aria-hidden="true">
        <circle cx="34" cy="34" r="31"></circle>
        <path d="M22 35 L30 43 L46 26"></path>
      </svg>
      <h3>${delivered ? 'Approval email sent!' : 'Post saved!'}</h3>
      <p>${delivered
        ? 'Check your inbox and tap <b>Approve</b>.<br>VISTA publishes it automatically at the scheduled time.'
        : 'We couldn\'t email you — use the approval link below instead.'}</p>
      <dl class="vista-receipt">
        <div class="vista-receipt-row"><dt>Status</dt><dd class="vista-green">Pending approval</dd></div>
        <div class="vista-receipt-row"><dt>Scheduled for</dt><dd>${escapeHtml(when)}</dd></div>
        <div class="vista-receipt-row"><dt>Approval sent to</dt><dd>${escapeHtml(sentTo)}</dd></div>
        <div class="vista-receipt-row"><dt>Link expires</dt><dd>in 24 hours</dd></div>
        ${result.profileSaved ? `<div class="vista-receipt-row"><dt>Vortex profile</dt><dd class="vista-green">✓ Certificate added</dd></div>` : ''}
        ${result.approveUrl ? `<div class="vista-receipt-row"><dt>Approve manually</dt><dd><a href="${escapeHtml(result.approveUrl)}" target="_blank" rel="noopener">Open link ↗</a></dd></div>` : ''}
      </dl>
      <button class="vista-btn vista-btn-secondary" style="width:100%" data-vista-again>+ Schedule another post</button>`;

    wrap.querySelector('[data-vista-again]').addEventListener('click', reset);
    body.appendChild(wrap);
  }

  // ── My Posts (side view, reachable from the header at any time) ──────────
  function showPosts() {
    stepper.style.display = 'none';
    onSubtitleChange?.('My posts');
    body.innerHTML = '';
    const view = createPostHistory({ onBack: showFlow });
    body.appendChild(view.el);
    body.scrollTop = 0;
  }

  // Return from a side view (My Posts) to whatever was on screen before it —
  // the success receipt if the post was already scheduled, else the live step.
  function showFlow() {
    if (lastSuccess) {
      showSuccess(lastSuccess);
      return;
    }
    stepper.style.display = '';
    render();
  }

  // ── Reset everything for a fresh run ─────────────────────────────────────
  function reset() {
    setState({
      step: STEPS.UPLOAD,
      maxReachedIndex: 0,
      image: null,
      questions: [],
      answers: ['', '', '', '', ''],
      postText: '',
      postStale: false,
      answersDirty: false,
      microSettings: { ...MICRO_SETTINGS_DEFAULTS },
      whatsappCc: '+91',
      whatsappNumber: '',
      email: '',
      saveToProfile: false,
      certTitle: '',
      certIssuer: '',
      scheduledAt: defaultScheduleISO(),
    });
    Object.values(steps).forEach((s) => s.onReset?.());
    lastSuccess = null;
    stepper.style.display = '';
    render();
  }

  render();
  return { el, reset, showPosts, showFlow };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function defaultScheduleISO() {
  // Tomorrow 09:00 local — a sensible default posting slot.
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(9, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
