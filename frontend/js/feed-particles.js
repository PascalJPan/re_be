/**
 * Feed particle system — ambient floating circles colored by the active post,
 * pulsing to BPM, drifting with scroll momentum.
 *
 * Two canvas layers: one behind post cards (z-index 0), one in front (z-index 2).
 */

let backCanvas, frontCanvas;
let backCtx, frontCtx;
let particles = [];
let animId = null;
let lastTime = 0;

// Current color target (HSL)
let targetH = 0, targetS = 50, targetL = 50;
let currentH = 0, currentS = 50, currentL = 50;
const COLOR_LERP_SPEED = 3; // per second — reaches target in ~0.8s

// Beat
let bpm = 80;
let beatPhase = 0; // 0..1 cycling

// Scroll wind
let windForceY = 0;

// Global fade (playing state)
let playing = false;
let globalOpacity = 0; // 0 = invisible, 1 = fully visible
const FADE_SPEED = 4; // per second — ~0.5s fade

const BACK_COUNT = 30;
const FRONT_COUNT = 20;

function hexToHSL(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  // Shortest arc
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return a + diff * t;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createParticle(layer) {
  const isFront = layer === 'front';
  return {
    x: Math.random(),
    y: Math.random(),
    radius: isFront ? 2 + Math.random() * 3 : 3 + Math.random() * 4,
    baseRadius: 0, // set below
    baseOpacity: isFront ? 0.15 + Math.random() * 0.15 : 0.25 + Math.random() * 0.2,
    phaseOffset: Math.random() * Math.PI * 2,
    driftSpeedX: (Math.random() - 0.5) * 0.02,
    driftSpeedY: (Math.random() - 0.5) * 0.02,
    layer,
  };
}

function spawnParticles() {
  particles = [];
  for (let i = 0; i < BACK_COUNT; i++) {
    const p = createParticle('back');
    p.baseRadius = p.radius;
    particles.push(p);
  }
  for (let i = 0; i < FRONT_COUNT; i++) {
    const p = createParticle('front');
    p.baseRadius = p.radius;
    particles.push(p);
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  for (const c of [backCanvas, frontCanvas]) {
    if (!c) continue;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function tick(now) {
  animId = requestAnimationFrame(tick);
  if (!lastTime) { lastTime = now; return; }

  const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime = now;

  // Lerp global opacity toward playing state
  const targetOpacity = playing ? 1 : 0;
  const ft = 1 - Math.exp(-FADE_SPEED * dt);
  globalOpacity = lerp(globalOpacity, targetOpacity, ft);

  // Skip drawing if fully invisible
  if (globalOpacity < 0.005) {
    backCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    frontCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    return;
  }

  // Lerp color
  const ct = 1 - Math.exp(-COLOR_LERP_SPEED * dt);
  currentH = lerpAngle(currentH, targetH, ct);
  currentS = lerp(currentS, targetS, ct);
  currentL = lerp(currentL, targetL, ct);

  // Advance beat phase
  const beatsPerSec = bpm / 60;
  beatPhase = (beatPhase + beatsPerSec * dt) % 1;
  const beatSin = Math.sin(beatPhase * Math.PI * 2);

  // Decay wind
  windForceY *= Math.pow(0.9, dt * 60); // ~0.9 per frame at 60fps

  const w = window.innerWidth;
  const h = window.innerHeight;

  // Clear both canvases
  backCtx.clearRect(0, 0, w, h);
  frontCtx.clearRect(0, 0, w, h);

  for (const p of particles) {
    // Brownian drift
    const time = now / 1000;
    const driftX = Math.sin(time * 0.5 + p.phaseOffset) * p.driftSpeedX;
    const driftY = Math.cos(time * 0.3 + p.phaseOffset * 1.3) * p.driftSpeedY;

    p.x += driftX * dt + (windForceY * 0.0001 * dt * (Math.random() - 0.5));
    p.y += driftY * dt + (windForceY * 0.0003 * dt);

    // Wrap around
    if (p.x < -0.05) p.x += 1.1;
    if (p.x > 1.05) p.x -= 1.1;
    if (p.y < -0.05) p.y += 1.1;
    if (p.y > 1.05) p.y -= 1.1;

    // Beat pulse
    const radiusMult = 1 + beatSin * 0.3;
    const opacityMult = 1 + beatSin * 0.15;
    const r = p.baseRadius * radiusMult;
    const opacity = Math.min(1, p.baseOpacity * opacityMult) * globalOpacity;

    // Slight hue variation per particle
    const hueVar = ((p.phaseOffset / (Math.PI * 2)) - 0.5) * 30;
    const pH = ((currentH + hueVar) % 360 + 360) % 360;

    const ctx = p.layer === 'back' ? backCtx : frontCtx;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${pH}, ${currentS}%, ${currentL}%, ${opacity})`;
    ctx.fill();
  }
}

export function init() {
  if (backCanvas) return; // already active

  backCanvas = document.createElement('canvas');
  backCanvas.id = 'feed-particles-back';
  frontCanvas = document.createElement('canvas');
  frontCanvas.id = 'feed-particles-front';

  document.body.appendChild(backCanvas);
  document.body.appendChild(frontCanvas);

  backCtx = backCanvas.getContext('2d');
  frontCtx = frontCanvas.getContext('2d');

  resize();
  spawnParticles();
  window.addEventListener('resize', resize);
  lastTime = 0;
  animId = requestAnimationFrame(tick);
}

export function setActivePost(colorHex, postBpm) {
  if (colorHex) {
    const hsl = hexToHSL(colorHex);
    targetH = hsl.h;
    targetS = hsl.s;
    targetL = hsl.l;
  }
  if (postBpm && postBpm > 0) {
    bpm = postBpm;
  } else {
    bpm = 80;
  }
}

export function setPlaying(isPlaying) {
  playing = isPlaying;
}

export function applyScrollForce(deltaY) {
  windForceY += deltaY;
}

export function destroy() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  window.removeEventListener('resize', resize);
  if (backCanvas) { backCanvas.remove(); backCanvas = null; backCtx = null; }
  if (frontCanvas) { frontCanvas.remove(); frontCanvas = null; frontCtx = null; }
  particles = [];
  lastTime = 0;
  beatPhase = 0;
  windForceY = 0;
  playing = false;
  globalOpacity = 0;
}
