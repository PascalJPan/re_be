import * as api from './api.js';
import * as imageCapture from './image-capture.js';
import * as squiggle from './squiggle-canvas.js';
import * as audioPlayer from './audio-player.js';
import * as ui from './ui.js';

// Comment squiggle state (separate from main squiggle)
let commentPoints = [];
let commentDrawing = false;
let commentStartTime = 0;
let commentColor = '#4488ff';

let phase = 'create';

document.addEventListener('DOMContentLoaded', async () => {
  imageCapture.init('image-input', 'image-canvas');
  squiggle.init('squiggle-overlay');

  // Color picker
  const colorPicker = document.getElementById('color-picker');
  colorPicker.addEventListener('input', (e) => {
    squiggle.setColor(e.target.value);
  });

  // When image loads, sync squiggle overlay size
  const imageCanvas = document.getElementById('image-canvas');
  const observer = new MutationObserver(() => {
    if (imageCanvas.style.display !== 'none') {
      squiggle.syncSize(imageCanvas);
      ui.show('squiggle-overlay');
      ui.show('create-controls');
      ui.hide('upload-prompt');
    }
  });
  observer.observe(imageCanvas, { attributes: true, attributeFilter: ['style'] });

  document.getElementById('btn-generate').addEventListener('click', onGenerate);
  document.getElementById('btn-add-comment').addEventListener('click', () => {
    ui.show('comment-form');
  });
  document.getElementById('btn-generate-comment').addEventListener('click', onGenerateComment);
  document.getElementById('btn-reset').addEventListener('click', onReset);

  // Comment image handling
  document.getElementById('comment-image-input').addEventListener('change', onCommentImageChange);
  document.getElementById('comment-color-picker').addEventListener('input', (e) => {
    commentColor = e.target.value;
  });

  // Comment squiggle
  const commentOverlay = document.getElementById('comment-squiggle-overlay');
  commentOverlay.addEventListener('pointerdown', onCommentPointerDown);
  commentOverlay.addEventListener('pointermove', onCommentPointerMove);
  commentOverlay.addEventListener('pointerup', () => { commentDrawing = false; });
  commentOverlay.addEventListener('pointerleave', () => { commentDrawing = false; });

  // Check for existing post
  try {
    const data = await api.getCurrentPost();
    if (data) {
      showPost(data.post);
      const commentsData = await api.getComments();
      showComments(commentsData.comments);
    }
  } catch (e) {
    // No post
  }
});

// --- Main post ---

async function onGenerate() {
  const file = imageCapture.getFile();
  if (!file) { ui.showError('Upload an image first'); return; }

  const pts = squiggle.getPoints();
  if (pts.length < 2) { ui.showError('Draw a squiggle on the image'); return; }

  const color = document.getElementById('color-picker').value;
  ui.showLoading('Analyzing image and generating audio...');

  try {
    const data = await api.createPost(file, color, pts);
    ui.hideLoading();
    showPost(data.post);
  } catch (e) {
    ui.hideLoading();
    ui.showError(e.message);
  }
}

function showPost(post) {
  phase = 'view';
  ui.hide('create-section');
  ui.show('view-section');

  const postAudioContainer = document.getElementById('post-audio');
  audioPlayer.clearPlayers(postAudioContainer);
  audioPlayer.createPlayer(post.audio_url, postAudioContainer);

  const metaContainer = document.getElementById('post-metadata');
  ui.renderMetadata(post.structured_object, metaContainer);
}

function showComments(comments) {
  const container = document.getElementById('comments-list');
  container.innerHTML = '';
  for (const comment of comments) {
    const div = document.createElement('div');
    div.className = 'comment-item';

    const meta = document.createElement('div');
    meta.className = 'comment-meta';
    ui.renderMetadata(comment.structured_object, meta);
    div.appendChild(meta);

    audioPlayer.createPlayer(comment.audio_url, div);
    container.appendChild(div);
  }
}

// --- Comment image + squiggle ---

function onCommentImageChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const MAX = 1024;
    let w = img.width, h = img.height;
    if (w > MAX || h > MAX) {
      const scale = MAX / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = document.getElementById('comment-canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);

    const overlay = document.getElementById('comment-squiggle-overlay');
    overlay.width = w;
    overlay.height = h;

    document.getElementById('comment-canvas-container').style.display = '';
  };
  img.src = url;
}

function onCommentPointerDown(e) {
  commentDrawing = true;
  commentPoints = [];
  commentStartTime = Date.now();

  const overlay = document.getElementById('comment-squiggle-overlay');
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.strokeStyle = commentColor;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  const pt = getCommentPoint(e, overlay);
  ctx.moveTo(pt.x * overlay.width, pt.y * overlay.height);
  commentPoints.push({ x: pt.x, y: pt.y, t: 0 });
}

function onCommentPointerMove(e) {
  if (!commentDrawing) return;
  const overlay = document.getElementById('comment-squiggle-overlay');
  const ctx = overlay.getContext('2d');
  const pt = getCommentPoint(e, overlay);
  const t = Date.now() - commentStartTime;

  ctx.lineTo(pt.x * overlay.width, pt.y * overlay.height);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pt.x * overlay.width, pt.y * overlay.height);
  commentPoints.push({ x: pt.x, y: pt.y, t });
}

function getCommentPoint(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  };
}

// --- Comment generation ---

async function onGenerateComment() {
  const fileInput = document.getElementById('comment-image-input');
  const file = fileInput.files[0];
  if (!file) { ui.showError('Upload an image for the comment'); return; }
  if (commentPoints.length < 2) { ui.showError('Draw a squiggle on the comment image'); return; }

  const color = document.getElementById('comment-color-picker').value;
  ui.showLoading('Generating comment audio...');

  try {
    const resizedFile = await resizeImage(file);
    const data = await api.createComment(resizedFile, color, commentPoints);
    ui.hideLoading();
    ui.hide('comment-form');

    const commentsData = await api.getComments();
    showComments(commentsData.comments);

    // Reset comment form
    fileInput.value = '';
    commentPoints = [];
    document.getElementById('comment-canvas-container').style.display = 'none';
    const overlay = document.getElementById('comment-squiggle-overlay');
    overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
  } catch (e) {
    ui.hideLoading();
    ui.showError(e.message);
  }
}

function resizeImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1024;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    };
    img.src = url;
  });
}

// --- Reset ---

async function onReset() {
  ui.showLoading('Resetting...');
  try {
    await api.resetAll();
    ui.hideLoading();
    phase = 'create';
    ui.hide('view-section');
    ui.hide('comment-form');
    ui.show('create-section');
    ui.show('upload-prompt');
    imageCapture.clear();
    squiggle.clear();
    commentPoints = [];
    document.getElementById('comments-list').innerHTML = '';
    document.getElementById('post-audio').innerHTML = '';
    document.getElementById('post-metadata').innerHTML = '';
  } catch (e) {
    ui.hideLoading();
    ui.showError(e.message);
  }
}
