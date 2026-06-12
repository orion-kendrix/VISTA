// src/widget/steps/Step1Upload.js
// Drag-and-drop certificate upload with client-side compression.
// Prefers the browser-image-compression CDN library (loaded by index.html /
// embed.js); falls back to a canvas-based compressor so the widget still
// works when the CDN is blocked — never silently (R8): we log which path ran.

export function createStep1Upload(ctx) {
  const el = document.createElement('div');

  el.innerHTML = `
    <div data-slot="file"></div>
    <div class="vista-dropzone" data-slot="drop">
      <input type="file" accept="image/*,application/pdf" aria-label="Upload certificate" />
      <div class="vista-drop-emoji">🎓</div>
      <h3>Drop your certificate here</h3>
      <p>JPG, PNG or PDF — compressed in your browser before upload</p>
      <span class="vista-drop-chip">or click to browse</span>
    </div>
    <div class="vista-btn-row">
      <button class="vista-btn vista-btn-primary" data-slot="next" disabled>
        Analyse with Gemini →
      </button>
    </div>
    <p class="vista-hint">Powered by Gemini Flash · Your image is only used to draft this post</p>`;

  const drop = el.querySelector('[data-slot="drop"]');
  const fileSlot = el.querySelector('[data-slot="file"]');
  const input = drop.querySelector('input');
  const nextBtn = el.querySelector('[data-slot="next"]');

  // ── Events ───────────────────────────────────────────────────────────────
  input.addEventListener('change', () => handleFile(input.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('vista-dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('vista-dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('vista-dragover');
    handleFile(e.dataTransfer.files[0]);
  });
  nextBtn.addEventListener('click', () => ctx.goNext());

  // ── File handling ────────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return;
    const isPdf = file.type === 'application/pdf';

    if (file.size > 8 * 1024 * 1024) {
      renderError('That file is over 8 MB. Please use a smaller image or PDF.');
      return;
    }

    try {
      nextBtn.disabled = true;
      nextBtn.innerHTML = '<span class="vista-spinner"></span> Compressing…';

      const processed = isPdf ? file : await compress(file);
      const dataUrl = await readAsDataURL(processed);

      // New upload invalidates everything downstream (questions/post belong
      // to the old image).
      ctx.setState({
        image: {
          base64: dataUrl.split(',')[1],
          mimeType: processed.type || 'image/jpeg',
          dataUrl,
          name: file.name,
          sizeKB: Math.round(processed.size / 1024),
          isPdf,
        },
        questions: [],
        answers: ['', '', '', '', ''],
        postText: '',
        postStale: false,
      });

      renderFileCard();
      nextBtn.disabled = false;
      nextBtn.textContent = 'Analyse with Gemini →';
    } catch (err) {
      console.error('[VISTA] Upload failed:', err);
      renderError('Could not read that file. Try a different image.');
      nextBtn.disabled = true;
      nextBtn.textContent = 'Analyse with Gemini →';
    }
  }

  async function compress(file) {
    // Path 1: CDN library if the host page loaded it.
    if (typeof window !== 'undefined' && window.imageCompression) {
      try {
        return await window.imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
        });
      } catch (err) {
        console.warn('[VISTA] CDN compression failed, using canvas fallback:', err);
      }
    } else {
      console.info('[VISTA] browser-image-compression not present — canvas fallback.');
    }
    // Path 2: canvas fallback — resize to ≤1600px, re-encode as JPEG q0.82.
    return canvasCompress(file, 1600, 0.82);
  }

  function renderFileCard() {
    const img = ctx.state.image;
    fileSlot.innerHTML = `
      <div class="vista-file-card">
        ${img.isPdf
          ? `<div class="vista-file-pdf">📄</div>`
          : `<img src="${img.dataUrl}" alt="Certificate preview" />`}
        <div class="vista-file-meta">
          <div>
            <div class="vista-file-name">${escapeHtml(img.name)}</div>
            <span class="vista-file-badge">✓ ${img.sizeKB} KB ready</span>
          </div>
          <button class="vista-file-remove" type="button">Remove</button>
        </div>
      </div>`;
    fileSlot.querySelector('.vista-file-remove').addEventListener('click', clearFile);
    drop.style.display = 'none';
  }

  function renderError(msg) {
    fileSlot.innerHTML = `
      <div class="vista-error"><div><b>Upload problem</b>${escapeHtml(msg)}</div></div>`;
  }

  function clearFile() {
    ctx.setState({ image: null, questions: [], answers: ['', '', '', '', ''], postText: '', postStale: false });
    fileSlot.innerHTML = '';
    drop.style.display = '';
    input.value = '';
    nextBtn.disabled = true;
  }

  return {
    el,
    onEnter() {
      if (ctx.state.image) { renderFileCard(); nextBtn.disabled = false; }
    },
    onReset: clearFile,
  };
}

// ── Utilities ───────────────────────────────────────────────────────────────
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('FileReader failed'));
    r.readAsDataURL(file);
  });
}

function canvasCompress(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            blob ? resolve(new File([blob], file.name, { type: 'image/jpeg' }))
                 : reject(new Error('canvas.toBlob returned null'));
          },
          'image/jpeg',
          quality
        );
      } catch (err) { URL.revokeObjectURL(url); reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image decode failed')); };
    img.src = url;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
