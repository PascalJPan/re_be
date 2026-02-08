import * as api from './api.js';
import * as audioPlayer from './audio-player.js';
import { safePlay } from './audio-player.js';
import { sampleColor } from './pixel-sampler.js';
import { toast } from './ui.js';
import { navigate } from './router.js';
import { addGeneratingPost, addGeneratingComment } from './generation-tracker.js';

const MAX_DIMENSION = 1024;

let overlay = null;
let imageCanvas = null;
let squiggleCanvas = null;
let squiggleCtx = null;
let currentFile = null;
let points = [];
let drawing = false;
let startTime = 0;
let derivedColor = '#888888';
let commentPostId = null;  // non-null when creating a comment
let submitting = false;

/**
 * Open creation overlay.
 * @param {string|null} parentPostId - if non-null, creating a comment on this post
 * @param {function|null} onDone - callback after comment publish (ignored for posts)
 */
export function openCreateOverlay(parentPostId = null, onDone = null) {
  audioPlayer.clearPlayers();
  commentPostId = parentPostId;
  submitting = false;

  overlay = document.createElement('div');
  overlay.className = 'create-overlay';
  overlay.innerHTML = `
    <div class="create-overlay-inner">
      <div class="create-top-bar">
        <button class="create-close-btn">\u2715</button>
        <span class="create-title">${parentPostId ? 'New Comment' : 'New Post'}</span>
        <div class="create-spacer"></div>
      </div>
      <div class="create-canvas-area">
        <div class="create-canvas-wrapper">
          <canvas class="create-image-canvas"></canvas>
          <div class="create-color-overlay"></div>
          <canvas class="create-squiggle-canvas"></canvas>
        </div>
        <div class="create-upload-prompt">
          <div class="create-pick-btn" role="button" tabindex="0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
          </div>
          <div class="create-upload-divider"></div>
          <div class="create-camera-btn" role="button" tabindex="0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <input type="file" class="create-file-input" accept="image/*" style="display:none">
          <input type="file" class="create-camera-input" accept="image/*" capture="environment" style="display:none">
        </div>
      </div>
      <div class="create-bottom-bar" style="display:none">
        <div class="create-color-preview"></div>
      </div>
      <div class="create-result" style="display:none">
        <div class="create-result-audio"></div>
      </div>
      <div class="create-loading" style="display:none">Generating...</div>
    </div>
  `;

  document.body.appendChild(overlay);
  setupOverlayEvents(onDone);
}

function setupOverlayEvents(onDone) {
  imageCanvas = overlay.querySelector('.create-image-canvas');
  squiggleCanvas = overlay.querySelector('.create-squiggle-canvas');
  squiggleCtx = squiggleCanvas.getContext('2d');

  const fileInput = overlay.querySelector('.create-file-input');
  const cameraInput = overlay.querySelector('.create-camera-input');
  const pickBtn = overlay.querySelector('.create-pick-btn');
  const cameraBtn = overlay.querySelector('.create-camera-btn');
  const closeBtn = overlay.querySelector('.create-close-btn');
  const uploadPrompt = overlay.querySelector('.create-upload-prompt');
  const bottomBar = overlay.querySelector('.create-bottom-bar');
  const colorPreview = overlay.querySelector('.create-color-preview');

  // Pick image
  pickBtn.addEventListener('click', () => fileInput.click());
  cameraBtn.addEventListener('click', () => {
    if (navigator.maxTouchPoints > 0) {
      cameraInput.click();
    } else {
      openWebcam((file) => loadImageToCanvas(file, uploadPrompt, bottomBar));
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadImageToCanvas(e.target.files[0], uploadPrompt, bottomBar);
  });
  cameraInput.addEventListener('change', (e) => {
    if (e.target.files[0]) loadImageToCanvas(e.target.files[0], uploadPrompt, bottomBar);
  });

  // Squiggle drawing
  squiggleCanvas.addEventListener('pointerdown', onPointerDown);
  squiggleCanvas.addEventListener('pointermove', onPointerMove);
  squiggleCanvas.addEventListener('pointerup', () => {
    drawing = false;
    if (points.length >= 2 && currentFile && !submitting) {
      derivedColor = sampleColor(points);
      colorPreview.style.background = derivedColor;
      overlay.querySelector('.create-color-overlay').style.background = derivedColor;

      // Auto-submit on squiggle release
      autoSubmit(onDone);
    }
  });
  squiggleCanvas.addEventListener('pointerleave', () => { drawing = false; });

  // Close
  closeBtn.addEventListener('click', () => {
    closeOverlay();
  });
}

async function autoSubmit(onDone) {
  if (submitting) return;
  submitting = true;

  if (commentPostId) {
    // Comments are async — close overlay immediately
    try {
      const data = await api.createComment(commentPostId, currentFile, derivedColor, points);
      addGeneratingComment(data.id, commentPostId, data.color_hex);
      closeOverlay();
      if (onDone) onDone(data.id, 'generating');
    } catch (e) {
      submitting = false;
      toast(e.message, true);
    }
  } else {
    // Posts are async — close overlay immediately
    try {
      const data = await api.createPost(currentFile, derivedColor, points);
      const postId = data.id;
      const colorHex = data.color_hex;

      addGeneratingPost(postId, colorHex);
      closeOverlay();
      navigate('/feed');
    } catch (e) {
      submitting = false;
      toast(e.message, true);
      closeOverlay();
    }
  }
}

function loadImageToCanvas(file, uploadPrompt, bottomBar) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    let w = img.width, h = img.height;
    if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    imageCanvas.width = w;
    imageCanvas.height = h;
    imageCanvas.getContext('2d').drawImage(img, 0, 0, w, h);
    imageCanvas.style.display = 'block';

    squiggleCanvas.width = w;
    squiggleCanvas.height = h;
    squiggleCanvas.style.display = 'block';

    // Set original file as immediate fallback, then update with resized blob
    currentFile = file;
    imageCanvas.toBlob((blob) => {
      if (blob) {
        currentFile = new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' });
      }
    }, 'image/jpeg', 0.85);

    uploadPrompt.style.display = 'none';
    bottomBar.style.display = '';

    // Reset state
    points = [];
    derivedColor = '#888888';
    submitting = false;
  };
  img.src = url;
}

function onPointerDown(e) {
  if (submitting) return;
  drawing = true;
  points = [];
  startTime = Date.now();
  squiggleCtx.clearRect(0, 0, squiggleCanvas.width, squiggleCanvas.height);

  const pt = getPoint(e);
  points.push({ x: pt.x, y: pt.y, t: 0 });
}

function onPointerMove(e) {
  if (!drawing) return;
  const pt = getPoint(e);
  const t = Date.now() - startTime;
  points.push({ x: pt.x, y: pt.y, t });

  // Live color preview while drawing
  if (points.length >= 2 && overlay) {
    derivedColor = sampleColor(points);
    const colorPreview = overlay.querySelector('.create-color-preview');
    const colorOverlay = overlay.querySelector('.create-color-overlay');
    if (colorPreview) colorPreview.style.background = derivedColor;
    if (colorOverlay) colorOverlay.style.background = derivedColor;
  }
}

function getPoint(e) {
  const rect = squiggleCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  };
}

function closeOverlay() {
  audioPlayer.clearPlayers();
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  currentFile = null;
  points = [];
  commentPostId = null;
  submitting = false;
}

function openWebcam(onCapture) {
  const modal = document.createElement('div');
  modal.className = 'webcam-modal';
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  modal.appendChild(video);

  const btnRow = document.createElement('div');
  btnRow.className = 'webcam-buttons';
  const captureBtn = document.createElement('button');
  captureBtn.className = 'primary';
  captureBtn.textContent = 'Capture';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  btnRow.appendChild(captureBtn);
  btnRow.appendChild(cancelBtn);
  modal.appendChild(btnRow);
  document.body.appendChild(modal);

  let stream = null;
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(s => { stream = s; video.srcObject = stream; })
    .catch(() => { cleanup(); toast('Could not access camera', true); });

  function cleanup() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    modal.remove();
  }

  captureBtn.addEventListener('click', () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const size = Math.min(vw, vh);
    const sx = (vw - size) / 2;
    const sy = (vh - size) / 2;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    c.getContext('2d').drawImage(video, sx, sy, size, size, 0, 0, size, size);
    c.toBlob(blob => {
      cleanup();
      onCapture(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.85);
  });
  cancelBtn.addEventListener('click', cleanup);
}
