// src/widget/steps/Step3Preview.js
// Generates the post (with whatever micro-settings are currently in state —
// defaults on first pass) and renders it inside a realistic LinkedIn card.
// The user can edit the text inline; edits are kept in state so Step 4's
// submit sends exactly what they approved here.

import { generatePost, initiateLinkedInAuth, AuthRequiredError } from '../../shared/api.js';

const LINKEDIN_CHAR_LIMIT = 3000;
const THINKING = [
  'Reading your five answers…',
  'Matching your tone…',
  'Writing the hook…',
  'Tightening the middle…',
  'Adding hashtags…',
];

export function createStep3Preview(ctx) {
  const el = document.createElement('div');
  let loading = false;
  let thinkTimer = null;
  let editing = false;

  function render() {
    el.innerHTML = '';
    if (loading) return renderLoading();
    if (!ctx.state.postText) return;

    el.innerHTML = `
      <div class="vista-preview-head">
        <h3>Your LinkedIn draft</h3>
        <button class="vista-edit-btn" data-slot="edit">✏️ Edit</button>
      </div>
      <div class="vista-li-card" data-slot="card">
        <div class="vista-li-head">
          <div class="vista-li-avatar">in</div>
          <div>
            <div class="vista-li-name">Your Name</div>
            <div class="vista-li-meta">Posting via VISTA · Just now · 🌐</div>
          </div>
        </div>
        ${ctx.state.image && !ctx.state.image.isPdf
          ? `<div class="vista-li-img"><img src="${ctx.state.image.dataUrl}" alt="Certificate" /></div>`
          : ''}
        <div class="vista-li-text" data-slot="text"></div>
        <textarea class="vista-li-textarea" data-slot="textarea"></textarea>
        <div class="vista-li-foot"><span>👍 Like</span><span>💬 Comment</span><span>↗ Repost</span></div>
      </div>
      <div class="vista-post-meta">
        <span data-slot="count"></span>
        <button class="vista-edit-btn" data-slot="copy" style="border:none;background:none;padding:4px">📋 Copy</button>
      </div>
      <div class="vista-btn-row">
        <button class="vista-btn vista-btn-secondary" data-slot="back">←</button>
        <button class="vista-btn vista-btn-primary" data-slot="next">Looks good — schedule it →</button>
      </div>`;

    const textDiv = el.querySelector('[data-slot="text"]');
    const ta = el.querySelector('[data-slot="textarea"]');
    textDiv.textContent = ctx.state.postText;
    ta.value = ctx.state.postText;

    el.querySelector('[data-slot="edit"]').addEventListener('click', toggleEdit);
    el.querySelector('[data-slot="back"]').addEventListener('click', () => {
      commitEdits();
      ctx.goBack();
    });
    el.querySelector('[data-slot="next"]').addEventListener('click', () => {
      commitEdits();
      ctx.goNext();
    });
    el.querySelector('[data-slot="copy"]').addEventListener('click', copyPost);
    // Commit as they type: the stepper pills navigate away without going
    // through the buttons below, so state must never lag the textarea.
    ta.addEventListener('input', () => {
      commitEdits();
      updateCount();
    });
    updateCount();
  }

  function toggleEdit() {
    const card = el.querySelector('[data-slot="card"]');
    const btn = el.querySelector('[data-slot="edit"]');
    editing = !editing;
    card.classList.toggle('vista-editing', editing);
    btn.innerHTML = editing ? '👁 Preview' : '✏️ Edit';
    if (!editing) commitEdits();
  }

  function commitEdits() {
    const ta = el.querySelector('[data-slot="textarea"]');
    const textDiv = el.querySelector('[data-slot="text"]');
    if (!ta) return;
    ctx.setState({ postText: ta.value });
    if (textDiv) textDiv.textContent = ta.value;
  }

  function updateCount() {
    const ta = el.querySelector('[data-slot="textarea"]');
    const span = el.querySelector('[data-slot="count"]');
    if (!ta || !span) return;
    const len = ta.value.length;
    const words = ta.value.trim().split(/\s+/).filter(Boolean).length;
    span.innerHTML = `${words} words · <span class="${len > LINKEDIN_CHAR_LIMIT - 200 ? 'vista-over' : ''}">${len}/${LINKEDIN_CHAR_LIMIT}</span>`;
    // The backend (and LinkedIn) hard-reject >3000 chars — stop it here.
    const next = el.querySelector('[data-slot="next"]');
    if (next) next.disabled = len > LINKEDIN_CHAR_LIMIT;
  }

  async function copyPost() {
    // Pull any in-flight edits into state so the clipboard never lags the textarea.
    commitEdits();
    try {
      await navigator.clipboard.writeText(ctx.state.postText);
      const b = el.querySelector('[data-slot="copy"]');
      b.textContent = '✓ Copied';
      setTimeout(() => (b.textContent = '📋 Copy'), 1600);
    } catch (err) {
      console.warn('[VISTA] Clipboard unavailable:', err);
    }
  }

  function renderLoading() {
    el.innerHTML = `
      <div class="vista-loading">
        <span class="vista-spinner"></span>
        <p>Crafting your post…</p>
        <small data-slot="think">${THINKING[0]}</small>
      </div>`;
    let i = 0;
    clearInterval(thinkTimer);
    thinkTimer = setInterval(() => {
      const s = el.querySelector('[data-slot="think"]');
      if (!s) return clearInterval(thinkTimer);
      i = (i + 1) % THINKING.length;
      s.textContent = THINKING[i];
    }, 1100);
  }

  function renderAuthGate() {
    el.innerHTML = `
      <div class="vista-auth-gate">
        <h4>Connect LinkedIn to continue</h4>
        <p>Connect your account so VISTA can write and later publish this post for you.</p>
        <button class="vista-btn vista-btn-primary" data-slot="auth">Connect LinkedIn</button>
      </div>
      <div class="vista-btn-row">
        <button class="vista-btn vista-btn-secondary" data-slot="back" style="flex:1">← Back</button>
      </div>`;
    el.querySelector('[data-slot="auth"]').addEventListener('click', () => initiateLinkedInAuth());
    el.querySelector('[data-slot="back"]').addEventListener('click', ctx.goBack);
  }

  function renderError(message) {
    el.innerHTML = `
      <div class="vista-error">
        <div><b>Generation failed</b>${escapeHtml(message)}</div>
        <button data-slot="retry">Retry</button>
      </div>
      <div class="vista-btn-row">
        <button class="vista-btn vista-btn-secondary" data-slot="back" style="flex:1">← Back</button>
      </div>`;
    el.querySelector('[data-slot="retry"]').addEventListener('click', fetchPost);
    el.querySelector('[data-slot="back"]').addEventListener('click', ctx.goBack);
  }

  async function fetchPost() {
    loading = true;
    render();
    try {
      const { questions, answers, microSettings } = ctx.state;
      const { postText } = await generatePost(questions, answers, microSettings);
      if (!postText || typeof postText !== 'string') throw new Error('Empty post returned.');
      ctx.setState({ postText, postStale: false, answersDirty: false });
      loading = false;
      clearInterval(thinkTimer);
      render();
    } catch (err) {
      loading = false;
      clearInterval(thinkTimer);
      console.error('[VISTA] generate-post failed:', err);
      if (err instanceof AuthRequiredError) return renderAuthGate();
      renderError(err.message || 'The generation service did not respond.');
    }
  }

  return {
    el,
    onEnter() {
      // Re-generate when there is no draft yet, or when the answers/questions
      // the draft was built from have since been edited — Step 2's button says
      // "Generate post", so a changed answer must actually change the post.
      (!ctx.state.postText || ctx.state.answersDirty) ? fetchPost() : render();
    },
    onReset() {
      loading = false; editing = false;
      clearInterval(thinkTimer);
      el.innerHTML = '';
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
