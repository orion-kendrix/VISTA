// src/widget/embed.js  (Phase 3 — integration)
// The ONLY file the Vortex site ever touches. One script tag, zero config:
//
//   <script src="https://YOUR-VISTA.netlify.app/widget/embed.js"></script>
//
// Inline mode for the profile-page Upload Tab:
//
//   <script src="https://YOUR-VISTA.netlify.app/widget/embed.js"
//           data-mode="inline" data-container="#upload-tab"></script>
//
// Deliberately a plain (non-module) script so the tag needs no type attribute;
// it dynamic-imports the ES-module widget relative to its own src, which is
// why the deploy copies src/widget + src/shared side by side (see netlify.toml).

(function () {
  'use strict';

  var script = document.currentScript;
  if (!script || !script.src) {
    console.error('[VISTA] embed.js must be loaded via <script src=…>');
    return;
  }
  if (document.querySelector('.vista-root')) return; // never double-mount

  var base = new URL('.', script.src).href;      // …/widget/
  var origin = new URL(script.src).origin;       // https://vista.netlify.app

  // Cross-origin embeds (Vortex) must call functions on the VISTA origin,
  // not the host page's own origin.
  window.VISTA_API_BASE = window.VISTA_API_BASE || origin;

  // Inject widget styles once.
  if (!document.querySelector('link[data-vista-css]')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = base + 'widget.css';
    link.setAttribute('data-vista-css', '');
    document.head.appendChild(link);
  }

  // Best-effort load of the compression library; the widget falls back to a
  // canvas compressor if this never arrives, so failure here is non-fatal.
  if (!window.imageCompression && !document.querySelector('script[data-vista-compress]')) {
    var lib = document.createElement('script');
    lib.src = 'https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js';
    lib.async = true;
    lib.setAttribute('data-vista-compress', '');
    lib.onerror = function () {
      console.warn('[VISTA] compression CDN blocked — canvas fallback will be used.');
    };
    document.head.appendChild(lib);
  }

  var mode = script.dataset.mode === 'inline' ? 'inline' : 'fab';
  var container = script.dataset.container || null;

  function mount() {
    import(base + 'FABWidget.js')
      .then(function (m) { m.initVistaWidget({ mode: mode, container: container }); })
      .catch(function (err) { console.error('[VISTA] Failed to load widget modules:', err); });
  }

  // Inline mode needs its container to exist in the DOM first.
  if (mode === 'inline' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
