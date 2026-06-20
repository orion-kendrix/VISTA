// src/widget/PostHistory.js
// The "My Posts" view. Not a step in the stepper — a side view mounted by
// MultiStepForm.showPosts(). Self-contained: owns its own load/loading/error/
// empty/auth states and renders into the element it returns.

import { listPosts, AuthRequiredError, initiateLinkedInAuth } from '../shared/api.js';

// status → { label, colour-class }. Mirrors POST_STATUS in constants.js.
const STATUS_META = {
  draft:            { label: 'Draft',            cls: 'vista-ph-muted' },
  pending_approval: { label: 'Pending approval', cls: 'vista-ph-amber' },
  approved:         { label: 'Scheduled',        cls: 'vista-ph-blue'  },
  processing:       { label: 'Publishing…',      cls: 'vista-ph-blue'  },
  published:        { label: 'Published',        cls: 'vista-ph-green' },
  rejected:         { label: 'Rejected',         cls: 'vista-ph-red'   },
  failed:           { label: 'Failed',           cls: 'vista-ph-red'   },
};

/**
 * @param {{ onBack: () => void }} ctx
 * @returns {{ el: HTMLElement }}
 */
export function createPostHistory({ onBack } = {}) {
  const el = document.createElement('div');
  el.className = 'vista-ph';

  function setBusy() {
    el.innerHTML = `
      <div class="vista-loading">
        <div class="vista-spinner"></div>
        <p>Loading your posts…</p>
      </div>`;
  }

  function backBar(countLabel) {
    return `
      <div class="vista-ph-head">
        <button class="vista-ph-back" type="button">← New post</button>
        ${countLabel ? `<span class="vista-ph-count">${countLabel}</span>` : ''}
      </div>`;
  }

  function wireBack() {
    const b = el.querySelector('.vista-ph-back');
    if (b && onBack) b.addEventListener('click', onBack);
  }

  function renderAuthGate() {
    el.innerHTML = `
      ${backBar('')}
      <div class="vista-auth-gate">
        <h4>Connect LinkedIn to see your posts</h4>
        <p>Your post history lives with your LinkedIn connection. Connect once and your scheduled and published posts show up here.</p>
        <button class="vista-btn vista-btn-primary" type="button" data-vista-connect>Connect LinkedIn</button>
      </div>`;
    wireBack();
    el.querySelector('[data-vista-connect]')?.addEventListener('click', () => initiateLinkedInAuth());
  }

  function renderError(message) {
    el.innerHTML = `
      ${backBar('')}
      <div class="vista-error">
        <div><b>Couldn't load posts</b>${escapeHtml(message || 'Please try again.')}</div>
        <button type="button" data-vista-retry>Retry</button>
      </div>`;
    wireBack();
    el.querySelector('[data-vista-retry]')?.addEventListener('click', load);
  }

  function renderEmpty() {
    el.innerHTML = `
      ${backBar('')}
      <div class="vista-ph-empty">
        <div class="vista-ph-empty-emoji">🗂️</div>
        <p>No posts yet</p>
        <small>Schedule your first post and it'll appear here.</small>
      </div>`;
    wireBack();
  }

  function renderList(posts) {
    const items = posts.map(renderItem).join('');
    el.innerHTML = `
      ${backBar(`${posts.length} post${posts.length === 1 ? '' : 's'}`)}
      <div class="vista-ph-list">${items}</div>`;
    wireBack();
  }

  function renderItem(p) {
    const meta = STATUS_META[p.status] || { label: p.status, cls: 'vista-ph-muted' };
    const when = timeLine(p);
    const link = linkedInUrl(p);
    return `
      <div class="vista-ph-item">
        <div class="vista-ph-row1">
          <span class="vista-ph-badge ${meta.cls}">${escapeHtml(meta.label)}</span>
          ${when ? `<span class="vista-ph-when">${escapeHtml(when)}</span>` : ''}
        </div>
        <p class="vista-ph-text">${escapeHtml(snippet(p.post_text))}</p>
        ${link ? `<a class="vista-ph-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">View on LinkedIn ↗</a>` : ''}
      </div>`;
  }

  async function load() {
    setBusy();
    try {
      const { posts } = await listPosts();
      if (!Array.isArray(posts) || posts.length === 0) return renderEmpty();
      renderList(posts);
    } catch (err) {
      if (err instanceof AuthRequiredError) return renderAuthGate();
      console.error('[VISTA] list posts failed:', err);
      renderError(err.message);
    }
  }

  load();
  return { el };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function snippet(text, max = 160) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : (t || '(no text)');
}

// Which timestamp matters depends on where the post is in its lifecycle.
function timeLine(p) {
  if (p.status === 'published') return p.published_at ? `Published ${fmtDate(p.published_at)}` : 'Published';
  if (p.status === 'approved')  return p.scheduled_at ? `Scheduled for ${fmtDate(p.scheduled_at)}` : 'Scheduled';
  if (p.status === 'pending_approval') return p.scheduled_at ? `Awaiting approval · ${fmtDate(p.scheduled_at)}` : 'Awaiting approval';
  if (p.status === 'failed')    return 'Publish failed';
  return p.created_at ? `Saved ${fmtDate(p.created_at)}` : '';
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Build a LinkedIn permalink only for published posts whose id is a real URN.
function linkedInUrl(p) {
  const id = p.linkedin_post_id;
  if (p.status !== 'published' || !id) return null;
  if (!/^urn:li:(share|ugcPost|activity):/.test(id)) return null;
  return `https://www.linkedin.com/feed/update/${id}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
