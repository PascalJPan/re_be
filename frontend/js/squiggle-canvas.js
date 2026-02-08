let points = [];
let drawing = false;
let startTime = 0;
let overlayCanvas = null;
let overlayCtx = null;
let color = '#ff4444';

export function init(overlayId) {
  overlayCanvas = document.getElementById(overlayId);
  overlayCtx = overlayCanvas.getContext('2d');

  overlayCanvas.addEventListener('pointerdown', onPointerDown);
  overlayCanvas.addEventListener('pointermove', onPointerMove);
  overlayCanvas.addEventListener('pointerup', onPointerUp);
  overlayCanvas.addEventListener('pointerleave', onPointerUp);
}

export function syncSize(sourceCanvas) {
  overlayCanvas.width = sourceCanvas.width;
  overlayCanvas.height = sourceCanvas.height;
  overlayCanvas.style.width = sourceCanvas.style.width || sourceCanvas.width + 'px';
  overlayCanvas.style.height = sourceCanvas.style.height || sourceCanvas.height + 'px';
}

export function setColor(hex) {
  color = hex;
}

function onPointerDown(e) {
  drawing = true;
  points = [];
  startTime = Date.now();
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  overlayCtx.strokeStyle = color;
  overlayCtx.lineWidth = 3;
  overlayCtx.lineCap = 'round';
  overlayCtx.lineJoin = 'round';
  overlayCtx.beginPath();

  const pt = getPoint(e);
  overlayCtx.moveTo(pt.x * overlayCanvas.width, pt.y * overlayCanvas.height);
  points.push({ x: pt.x, y: pt.y, t: 0 });
}

function onPointerMove(e) {
  if (!drawing) return;
  const pt = getPoint(e);
  const t = Date.now() - startTime;
  overlayCtx.lineTo(pt.x * overlayCanvas.width, pt.y * overlayCanvas.height);
  overlayCtx.stroke();
  overlayCtx.beginPath();
  overlayCtx.moveTo(pt.x * overlayCanvas.width, pt.y * overlayCanvas.height);
  points.push({ x: pt.x, y: pt.y, t });
}

function onPointerUp() {
  drawing = false;
}

function getPoint(e) {
  const rect = overlayCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
  };
}

export function getPoints() {
  return points;
}

export function clear() {
  points = [];
  if (overlayCtx) {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }
}
