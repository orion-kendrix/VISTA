// src/widget/steps/Step2Questions.js
// Calls analyzeImage() when entered (if questions are missing), shows a
// skeleton shimmer while Gemini reads the certificate, then renders the 5
// question cards with a staggered entrance and an answered-progress bar.

import { analyzeImage, initiateLinkedInAuth, AuthRequiredError } from '../../shared/api.js';

const MIN_ANSWERS = 3; // 3 thoughtful answers is enough signal for a good post

export function createStep2Questions(ctx) {
  const el = document.createElement('div');
  let loading = false;

  function render() {
    const { questions } = ctx.state;
    el.innerHTML = '';

    if (loading) return renderSkeleton();
    if (!questions.length) return; // onEnter will kick off the fetch

    el.innerHTML = `
      <div class="vista-ai-chip"><span class="vista-ai-dot"></span> Gemini analysed your certificate</div>
      <div class="vista-qbar">
        <div class="vista-qbar-track"><div class="vista-qbar-fill" data-slot="fill"></div></div>
        <span class="vista-qbar-label" data-slot="count"></span>
      </div>
      <div data-slot="cards"></div>
      <div class="vista-btn-row">
        <button class="vista-btn vista-btn-secondary" data-slot="back">←</button>
        <button class="vista-btn vista-btn-primary" data-slot="next">Generate post →</button>
      </div>
      <p class="vista-hint">Answer at least ${MIN_ANSWERS} — more detail means a better post</p>`;

    const cards = el.querySelector('[data-slot="cards"]');
    questions.forEach((q, i) => {
      const card = document.createElement('div');
      card.className = 'vista-qcard';
      card.style.animationDelay = `${i * 60}ms`; // stagger entrance
      card.innerHTML = `
        <div class="vista-qhead">
          <span class="vista-qnum">${i + 1}</span><span>Question ${i + 1}</span>
        </div>
        <p class="vista-qtext">${escapeHtml(q)}</p>
        <textarea rows="2" placeholder="Share your answer…">${escapeHtml(ctx.state.answers[i] || '')}</textarea>`;
      const ta = card.querySelector('textarea');
      ta.addEventListener('input', () => {
        ctx.state.answers[i] = ta.value;
        ta.style.height = 'auto';                 // auto-grow
        ta.style.height = ta.scrollHeight + 'px';
        card.classList.toggle('vista-answered', ta.value.trim().length > 0);
        updateProgress();
      });
      if ((ctx.state.answers[i] || '').trim()) card.classList.add('vista-answered');
      cards.appendChild(card);
    });

    el.querySelector('[data-slot="back"]').addEventListener('click', ctx.goBack);
    el.querySelector('[data-slot="next"]').addEventListener('click', ctx.goNext);
    updateProgress();

    // Auto-grow textareas that already have content (returning from Step 3 with
    // saved answers, otherwise they'd be stuck at the 2-row default and clip
    // longer responses out of view).
    requestAnimationFrame(() => {
      cards.querySelectorAll('textarea').forEach((ta) => {
        if (ta.value) {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        }
      });
    });
  }

  function updateProgress() {
    const answered = ctx.state.answers.filter((a) => a.trim()).length;
    const fill = el.querySelector('[data-slot="fill"]');
    const count = el.querySelector('[data-slot="count"]');
    const next = el.querySelector('[data-slot="next"]');
    if (fill) fill.style.width = `${(answered / 5) * 100}%`;
    if (count) count.textContent = `${answered} of 5 answered`;
    if (next) next.disabled = answered < MIN_ANSWERS;
  }

  function renderSkeleton() {
    el.innerHTML = `
      <div class="vista-loading" style="padding:14px 0 18px">
        <p>Reading your certificate…</p>
        <small>Gemini Flash is extracting the details</small>
      </div>
      ${'<div class="vista-skel"></div>'.repeat(4)}`;
  }

  function renderAuthGate() {
    el.innerHTML = `
      <div class="vista-auth-gate">
        <h4>Connect LinkedIn to continue</h4>
        <p>VISTA needs a connected account before it can analyse certificates and post on your behalf.</p>
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
        <div><b>Analysis failed</b>${escapeHtml(message)}</div>
        <button data-slot="retry">Retry</button>
      </div>
      <div class="vista-btn-row">
        <button class="vista-btn vista-btn-secondary" data-slot="back" style="flex:1">← Back</button>
      </div>`;
    el.querySelector('[data-slot="retry"]').addEventListener('click', fetchQuestions);
    el.querySelector('[data-slot="back"]').addEventListener('click', ctx.goBack);
  }

  async function fetchQuestions() {
    const img = ctx.state.image;
    if (!img) { ctx.goTo('upload'); return; }
    loading = true;
    render();
    try {
      const { questions } = await analyzeImage(img.base64, img.mimeType);
      if (!Array.isArray(questions) || questions.length !== 5) {
        throw new Error('Expected exactly 5 questions from the API.');
      }
      ctx.setState({ questions });
      loading = false;
      render();
    } catch (err) {
      loading = false;
      console.error('[VISTA] analyze-questions failed:', err);
      if (err instanceof AuthRequiredError) return renderAuthGate();
      renderError(err.message || 'The analysis service did not respond.');
    }
  }

  return {
    el,
    onEnter() {
      ctx.state.questions.length ? render() : fetchQuestions();
    },
    onReset() { loading = false; el.innerHTML = ''; },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
