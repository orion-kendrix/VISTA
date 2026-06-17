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
      <p class="vista-hint">Answer at least ${MIN_ANSWERS} with real detail — random text won't make a good post</p>`;

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
        <textarea rows="2" placeholder="Share your answer…">${escapeHtml(ctx.state.answers[i] || '')}</textarea>
        <small class="vista-qhint">A bit more detail, please — random text won't make a good post.</small>`;
      const ta = card.querySelector('textarea');
      const reflect = (val) => {
        const t = val.trim();
        const ok = isSubstantive(t);
        card.classList.toggle('vista-answered', ok);
        card.classList.toggle('vista-thin', t.length > 0 && !ok);
      };
      ta.addEventListener('input', () => {
        ctx.state.answers[i] = ta.value;
        ta.style.height = 'auto';                 // auto-grow
        ta.style.height = ta.scrollHeight + 'px';
        reflect(ta.value);
        updateProgress();
      });
      reflect(ctx.state.answers[i] || '');
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
    // Only substantive answers count toward the gate, so gibberish can't unlock
    // generation (the friend's review: 'asas'/'asadasf' should be rejected).
    const answered = ctx.state.answers.filter((a) => isSubstantive(a)).length;
    const fill = el.querySelector('[data-slot="fill"]');
    const count = el.querySelector('[data-slot="count"]');
    const next = el.querySelector('[data-slot="next"]');
    if (fill) fill.style.width = `${(answered / 5) * 100}%`;
    if (count) count.textContent = `${answered} of 5 with detail`;
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

// A real answer is a short phrase, not keyboard-mashing. The length gate alone
// catches the reported cases ('asas', 'asadasf', 'jjjj'); looksJunky() adds
// cover for longer mashes ('asdfasdfasdf'). Word-like gibberish ('tesitni') is
// caught server-side by the generate-post prompt.
function isSubstantive(text) {
  const s = String(text || '').trim();
  return s.length >= 12 && !looksJunky(s);
}
function looksJunky(text) {
  const s = String(text || '').toLowerCase();
  if (/(.)\1{3,}/.test(s)) return true;                              // 'jjjj', 'aaaa'
  if (/^(.{1,2})\1{2,}$/.test(s.replace(/\s/g, ''))) return true;    // 'asas', 'ababab'
  if (/(asdf|sdfg|qwer|wert|erty|zxcv|xcvb|hjkl|qwerty)/.test(s)) return true; // keyboard runs
  const compact = s.replace(/[^a-z]/g, '');
  if (compact.length >= 4 && !/[aeiou]/.test(compact)) return true;  // no vowels at all
  if (compact.length >= 5) {                                         // one letter dominating
    const freq = {};
    let max = 0;
    for (const c of compact) { freq[c] = (freq[c] || 0) + 1; if (freq[c] > max) max = freq[c]; }
    if (max / compact.length >= 0.5) return true;
  }
  return false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
