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
    <div data-slot="profile"></div>
    <div class="vista-btn-row">
      <button class="vista-btn vista-btn-primary" data-slot="next" disabled>
        Analyse with Gemini →
      </button>
    </div>
    <p class="vista-hint">Powered by Gemini Flash · Your image is only used to draft this post</p>`;

  const drop = el.querySelector('[data-slot="drop"]');
  const fileSlot = el.querySelector('[data-slot="file"]');
  const profileSlot = el.querySelector('[data-slot="profile"]');
  const input = drop.querySelector('input');
  const nextBtn = el.querySelector('[data-slot="next"]');

  // ── Events ───────────────────────────────────────────────────────────────
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = ''; // so picking the SAME file again still fires 'change'
    handleFile(file);
  });
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
      // to the old image) — including stepper progress, or the user could
      // jump straight to Preview and generate a post from stale/empty answers.
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
        maxReachedIndex: 0,
      });

      profileSlot.innerHTML = ''; // hide the profile picker once a cert is chosen
      renderFileCard();
      nextBtn.disabled = false;
      nextBtn.textContent = 'Analyse with Gemini →';
      ctx.refresh(); // re-render the stepper so downstream pills lock again
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
    // The host page (e.g. Vortex) may expose a hook to also save the certificate
    // to the user's profile. The option only appears when that hook exists, so
    // the standalone widget is unaffected.
    const canSaveToProfile =
      typeof window !== 'undefined' && typeof window.VISTA_ON_SAVE_CERTIFICATE === 'function';
    if (canSaveToProfile && !ctx.state.certTitle) {
      ctx.setState({ certTitle: stripExt(img.name) });
    }

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
      </div>
      ${canSaveToProfile ? `
        <label class="vista-save-profile">
          <input type="checkbox" data-slot="saveprofile" ${ctx.state.saveToProfile ? 'checked' : ''} />
          <span>Also add this certificate to my Vortex profile</span>
        </label>
        <div class="vista-save-fields" data-slot="savefields" style="${ctx.state.saveToProfile ? '' : 'display:none'}">
          <input class="vista-input" data-slot="certtitle" placeholder="Certificate title"
                 value="${escapeHtml(ctx.state.certTitle || stripExt(img.name))}" />
          <input class="vista-input" data-slot="certissuer" placeholder="Issuer (optional)"
                 value="${escapeHtml(ctx.state.certIssuer || '')}" />
        </div>` : ''}`;

    fileSlot.querySelector('.vista-file-remove').addEventListener('click', () => {
      clearFile();
      ctx.refresh(); // stepper must lock downstream steps again
    });

    if (canSaveToProfile) {
      const cb = fileSlot.querySelector('[data-slot="saveprofile"]');
      const fields = fileSlot.querySelector('[data-slot="savefields"]');
      cb.addEventListener('change', () => {
        ctx.setState({ saveToProfile: cb.checked });
        fields.style.display = cb.checked ? '' : 'none';
      });
      fileSlot.querySelector('[data-slot="certtitle"]')
        .addEventListener('input', (e) => ctx.setState({ certTitle: e.target.value }));
      fileSlot.querySelector('[data-slot="certissuer"]')
        .addEventListener('input', (e) => ctx.setState({ certIssuer: e.target.value }));
    }
    drop.style.display = 'none';
  }

  // ── Pull from profile ────────────────────────────────────────────────────
  // The host page (e.g. Vortex) may expose the user's existing certificates so
  // they can skip the upload. Same opt-in pattern as VISTA_ON_SAVE_CERTIFICATE:
  // the picker only appears when the host provides them, so the standalone
  // widget is unaffected. Accepts either a preloaded array or a getter:
  //   window.VISTA_CERTIFICATES = [{ id?, title, issuer?, imageUrl }]
  //   window.VISTA_GET_CERTIFICATES = () => certs | Promise<certs>
  function getHostCertificates() {
    if (typeof window === 'undefined') return Promise.resolve([]);
    if (typeof window.VISTA_GET_CERTIFICATES === 'function') {
      return Promise.resolve().then(() => window.VISTA_GET_CERTIFICATES());
    }
    if (Array.isArray(window.VISTA_CERTIFICATES)) {
      return Promise.resolve(window.VISTA_CERTIFICATES);
    }
    return Promise.resolve([]);
  }

  async function renderProfilePicker() {
    profileSlot.innerHTML = '';
    if (ctx.state.image) return; // nothing to offer once a cert is chosen

    let certs;
    try {
      certs = await getHostCertificates();
    } catch (err) {
      console.warn('[VISTA] Could not load profile certificates:', err);
      return;
    }
    const list = (Array.isArray(certs) ? certs : [])
      .filter((c) => c && typeof c.imageUrl === 'string' && /^https?:\/\//i.test(c.imageUrl))
      .slice(0, 12);
    if (!list.length || ctx.state.image) return;

    const heading = document.createElement('div');
    heading.className = 'vista-or';
    heading.textContent = 'or pick one from your profile';
    profileSlot.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'vista-cert-grid';
    list.forEach((cert) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'vista-cert-chip';
      const thumb = document.createElement('span');
      thumb.className = 'vista-cert-thumb';
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', () => { thumb.textContent = '📄'; });
      img.src = cert.imageUrl; // property assignment — safe, never parsed as HTML
      thumb.appendChild(img);
      const name = document.createElement('span');
      name.className = 'vista-cert-name';
      name.textContent = cert.title || 'Certificate';
      item.append(thumb, name);
      item.addEventListener('click', () => usePulledCert(cert, item));
      grid.appendChild(item);
    });
    profileSlot.appendChild(grid);
  }

  async function usePulledCert(cert, item) {
    try {
      item.disabled = true;
      item.classList.add('vista-cert-loading');
      // We fetch the bytes ourselves (needs CORS on the host's storage), which
      // also means the File we build is same-origin — so canvas compression
      // below won't taint. A blocked fetch just falls back to manual upload.
      const res = await fetch(cert.imageUrl, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (blob.size > 8 * 1024 * 1024) throw new Error('file over 8 MB');

      const isPdf = blob.type === 'application/pdf' || /\.pdf($|\?)/i.test(cert.imageUrl);
      const base = (cert.title || 'certificate').replace(/[^\w.-]+/g, '_').slice(0, 40) || 'certificate';
      const name = `${base}${isPdf ? '.pdf' : '.jpg'}`;
      const file = new File([blob], name, { type: blob.type || (isPdf ? 'application/pdf' : 'image/jpeg') });

      const processed = isPdf ? file : await compress(file);
      const dataUrl = await readAsDataURL(processed);

      ctx.setState({
        image: {
          base64: dataUrl.split(',')[1],
          mimeType: processed.type || 'image/jpeg',
          dataUrl,
          name,
          sizeKB: Math.round(processed.size / 1024),
          isPdf,
        },
        questions: [], answers: ['', '', '', '', ''],
        postText: '', postStale: false, maxReachedIndex: 0,
        certTitle: cert.title || '', certIssuer: cert.issuer || '',
      });

      profileSlot.innerHTML = '';
      renderFileCard();
      nextBtn.disabled = false;
      nextBtn.textContent = 'Analyse with Gemini →';
      ctx.refresh();
    } catch (err) {
      console.error('[VISTA] Could not use profile certificate:', err);
      item.disabled = false;
      item.classList.remove('vista-cert-loading');
      renderError('Could not load that certificate — please upload the image instead.');
    }
  }

  function renderError(msg) {
    fileSlot.innerHTML = `
      <div class="vista-error"><div><b>Upload problem</b>${escapeHtml(msg)}</div></div>`;
  }

  function clearFile() {
    ctx.setState({
      image: null, questions: [], answers: ['', '', '', '', ''],
      postText: '', postStale: false, maxReachedIndex: 0,
      saveToProfile: false, certTitle: '', certIssuer: '',
    });
    fileSlot.innerHTML = '';
    drop.style.display = '';
    input.value = '';
    nextBtn.disabled = true;
    renderProfilePicker(); // offer the profile certs again
  }

  return {
    el,
    onEnter() {
      if (ctx.state.image) { renderFileCard(); nextBtn.disabled = false; }
      else renderProfilePicker();
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

function stripExt(name) {
  return String(name || 'Certificate').replace(/\.[^.]+$/, '').trim() || 'Certificate';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
