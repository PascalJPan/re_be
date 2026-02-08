const BAR_COUNT = 60;
const BAR_WIDTH = 3;
const BAR_GAP = 2;

// Shared AudioContext for decoding
let sharedCtx = null;
function getAudioContext() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sharedCtx;
}

// ==================== Sync Manager ====================
const sync = {
  players: new Map(),       // id -> { audio, peaks, canvas, color, height, active }
  duration: 0,              // shared loop duration in seconds
  startedAt: 0,             // performance.now() when clock started
  pauseOffset: 0,           // accumulated time when paused
  running: false,
  animFrameId: null,
  enabled: false,
};

export function initSync(duration) {
  clearSync();
  sync.duration = duration || 10;
  sync.enabled = true;
}

function clearSync() {
  sync.players.forEach(p => { p.audio.pause(); p.audio.src = ''; });
  sync.players.clear();
  if (sync.animFrameId) cancelAnimationFrame(sync.animFrameId);
  sync.animFrameId = null;
  sync.startedAt = 0;
  sync.pauseOffset = 0;
  sync.running = false;
  sync.enabled = false;
}

function getClockPosition() {
  if (!sync.running) return sync.pauseOffset;
  const elapsed = (performance.now() - sync.startedAt) / 1000 + sync.pauseOffset;
  return sync.duration > 0 ? elapsed % sync.duration : 0;
}

function startClock() {
  if (sync.running) return;
  sync.startedAt = performance.now();
  sync.running = true;
  if (!sync.animFrameId) tickLoop();
}

function stopClock() {
  if (!sync.running) return;
  sync.pauseOffset = getClockPosition();
  sync.running = false;
}

function togglePlayer(id) {
  const player = sync.players.get(id);
  if (!player) return;

  if (player.active) {
    // Deactivate
    player.active = false;
    player.audio.pause();
    // Stop clock if no active players remain
    let anyActive = false;
    sync.players.forEach(p => { if (p.active) anyActive = true; });
    if (!anyActive) stopClock();
  } else {
    // Activate
    player.active = true;
    const pos = getClockPosition();
    if (player.audio.duration) {
      player.audio.currentTime = pos % player.audio.duration;
    }
    player.audio.play().catch(() => {});
    startClock();
    if (!sync.animFrameId) tickLoop();
  }
}

function tickLoop() {
  let anyRegistered = sync.players.size > 0;
  if (!anyRegistered) { sync.animFrameId = null; return; }

  const pos = getClockPosition();
  const progress = sync.duration > 0 ? pos / sync.duration : 0;

  sync.players.forEach(p => {
    if (!p.peaks) return;
    const ctx = p.canvas.getContext('2d');
    drawWaveform(ctx, p.peaks, p.active ? progress : 0, p.color, p.height, p.active);

    // Drift correction for active players
    if (p.active && p.audio.duration) {
      const expectedTime = pos % p.audio.duration;
      const drift = Math.abs(p.audio.currentTime - expectedTime);
      if (drift > 0.15) {
        p.audio.currentTime = expectedTime;
      }
    }
  });

  sync.animFrameId = requestAnimationFrame(tickLoop);
}

// ==================== Waveform Drawing ====================
function computePeaks(audioBuffer, count) {
  const data = audioBuffer.getChannelData(0);
  const blockSize = Math.floor(data.length / count);
  const peaks = [];
  for (let i = 0; i < count; i++) {
    let max = 0;
    for (let j = 0; j < blockSize; j++) {
      const abs = Math.abs(data[i * blockSize + j]);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }
  return peaks;
}

function drawWaveform(ctx, peaks, progress, color, height, active = true) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const total = peaks.length;
  const progressIndex = Math.floor(progress * total);
  for (let i = 0; i < total; i++) {
    const x = i * (BAR_WIDTH + BAR_GAP);
    const barH = Math.max(2, peaks[i] * (height - 4));
    const y = (height - barH) / 2;
    if (active && i < progressIndex) {
      ctx.fillStyle = color;
    } else {
      ctx.fillStyle = active ? color + '4D' : color + '30';
    }
    ctx.beginPath();
    ctx.roundRect(x, y, BAR_WIDTH, barH, 1.5);
    ctx.fill();
  }
}

// ==================== Player Creation ====================
export function createPlayer(audioUrl, container, color = '#ff4444', opts = {}) {
  const overlay = opts.overlay || false;
  const useSync = opts.sync || false;
  const playerId = opts.id || ('player-' + Math.random().toString(36).slice(2, 8));

  const wrapper = document.createElement('div');
  wrapper.className = 'audio-player' + (overlay ? ' waveform-overlay' : '');

  const audio = document.createElement('audio');
  audio.src = audioUrl;
  audio.preload = 'auto';
  audio.loop = !useSync; // non-sync players loop natively

  const canvas = document.createElement('canvas');
  const height = overlay ? 56 : 48;
  canvas.className = 'waveform-canvas';
  canvas.height = height;

  let peaks = null;
  let simpleActive = false; // for non-sync simple play/pause

  // Decode audio for waveform
  fetch(audioUrl)
    .then(r => r.arrayBuffer())
    .then(buf => getAudioContext().decodeAudioData(buf))
    .then(decoded => {
      peaks = computePeaks(decoded, BAR_COUNT);
      canvas.width = BAR_COUNT * (BAR_WIDTH + BAR_GAP);
      const isActive = useSync ? (sync.players.get(playerId)?.active || false) : simpleActive;
      drawWaveform(canvas.getContext('2d'), peaks, 0, color, height, isActive);
      if (useSync && sync.players.has(playerId)) {
        sync.players.get(playerId).peaks = peaks;
      }
    })
    .catch(() => {
      peaks = Array.from({ length: BAR_COUNT }, () => 0.2 + Math.random() * 0.6);
      canvas.width = BAR_COUNT * (BAR_WIDTH + BAR_GAP);
      drawWaveform(canvas.getContext('2d'), peaks, 0, color, height, false);
      if (useSync && sync.players.has(playerId)) {
        sync.players.get(playerId).peaks = peaks;
      }
    });

  if (useSync && sync.enabled) {
    // Register with sync manager
    sync.players.set(playerId, {
      audio, peaks, canvas, color, height, active: false,
    });

    // Looping via ended event
    audio.addEventListener('ended', () => {
      const p = sync.players.get(playerId);
      if (p && p.active && sync.running) {
        const pos = getClockPosition();
        audio.currentTime = pos % (audio.duration || sync.duration);
        audio.play().catch(() => {});
      }
    });

    // Click canvas to toggle
    canvas.addEventListener('click', () => togglePlayer(playerId));
  } else {
    // Simple independent play/pause (feed cards)
    let animId = null;

    function simpleTick() {
      if (!peaks || !audio.duration) { animId = requestAnimationFrame(simpleTick); return; }
      const progress = audio.currentTime / audio.duration;
      drawWaveform(canvas.getContext('2d'), peaks, progress, color, height, true);
      if (!audio.paused) animId = requestAnimationFrame(simpleTick);
    }

    audio.addEventListener('play', () => {
      if (!simpleActive) {
        simpleActive = true;
        simpleTick();
      }
    });

    if (!opts.noClick) {
      canvas.addEventListener('click', () => {
        if (audio.paused) {
          simpleActive = true;
          audio.play().catch(() => {});
          simpleTick();
        } else {
          audio.pause();
          simpleActive = false;
          if (peaks) drawWaveform(canvas.getContext('2d'), peaks, 0, color, height, false);
        }
      });
    }

    audio.addEventListener('ended', () => {
      simpleActive = false;
      if (peaks) drawWaveform(canvas.getContext('2d'), peaks, 0, color, height, false);
    });

    audio.addEventListener('pause', () => {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
    });

    // External control for feed autoplay
    audio.feedPlay = () => {
      if (audio.paused) {
        simpleActive = true;
        audio.play().catch(() => {});
        simpleTick();
      }
    };

    audio.feedStop = () => {
      audio.pause();
      audio.currentTime = 0;
      simpleActive = false;
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      if (peaks) drawWaveform(canvas.getContext('2d'), peaks, 0, color, height, false);
    };
  }

  wrapper.appendChild(audio);
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);
  return audio;
}

export function clearPlayers() {
  // Stop all synced players
  clearSync();
  // Also stop any stray audio elements
  document.querySelectorAll('.audio-player audio').forEach(a => { a.pause(); a.src = ''; });
}
