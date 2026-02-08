const BAR_COUNT = 60;
const BAR_WIDTH = 3;
const BAR_GAP = 2;

// Shared AudioContext for decoding
let sharedCtx = null;
async function getAudioContext() {
  if (sharedCtx && sharedCtx.state === 'closed') sharedCtx = null;
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (sharedCtx.state === 'suspended') await sharedCtx.resume();
  return sharedCtx;
}

// ==================== Safe Play Helper ====================
export function safePlay(audio) {
  return audio.play().catch(err => {
    if (err.name === 'NotAllowedError') {
      console.warn('[audio-player] play blocked by browser autoplay policy');
    } else if (err.name !== 'AbortError') {
      console.warn('[audio-player] play() failed:', err.message);
    }
  });
}

// ==================== Sync Manager ====================
const sync = {
  players: new Map(),       // id -> { audio, peaks, canvas, color, height, active, ac }
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
  sync.players.forEach(p => {
    p.audio.pause();
    p.audio.removeAttribute('src');
    p.audio.load();
    if (p.ac) p.ac.abort();
  });
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
    safePlay(player.audio);
    startClock();
    if (!sync.animFrameId) tickLoop();
  }
}

function tickLoop() {
  let anyRegistered = sync.players.size > 0;
  if (!anyRegistered) { sync.animFrameId = null; return; }

  const pos = getClockPosition();
  const progress = sync.duration > 0 ? pos / sync.duration : 0;
  const time = performance.now() / 1000;

  sync.players.forEach(p => {
    if (!p.peaks) return;
    const ctx = p.canvas.getContext('2d');
    drawWaveform(ctx, p.peaks, p.active ? progress : 0, p.color, p.height, p.active, time);

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

function drawWaveform(ctx, peaks, progress, color, height, active = true, time = 0) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const total = peaks.length;
  const progressIndex = Math.floor(progress * total);
  for (let i = 0; i < total; i++) {
    const pulse = 1 + 0.15 * Math.sin(time * 2 + i * 0.3);
    const x = i * (BAR_WIDTH + BAR_GAP);
    const barH = Math.max(2, peaks[i] * (height - 4) * pulse);
    const y = (height - barH) / 2;
    if (active && i < progressIndex) {
      ctx.fillStyle = color;
    } else {
      ctx.fillStyle = active ? color + '80' : color + '4D';
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

  // Cache-bust: append timestamp so browser doesn't serve stale audio after recreate
  const bustUrl = audioUrl + (audioUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();

  const ac = new AbortController();
  const { signal } = ac;

  const wrapper = document.createElement('div');
  wrapper.className = 'audio-player' + (overlay ? ' waveform-overlay' : '');

  const audio = document.createElement('audio');
  audio.src = bustUrl;
  audio.preload = 'auto';
  audio.loop = !useSync; // non-sync players loop natively

  const canvas = document.createElement('canvas');
  const height = overlay ? 56 : 48;
  canvas.className = 'waveform-canvas';
  canvas.height = height;

  let peaks = null;
  let simpleActive = false; // for non-sync simple play/pause

  // Decode audio for waveform
  fetch(bustUrl, { signal })
    .then(r => r.arrayBuffer())
    .then(buf => getAudioContext().then(ctx => ctx.decodeAudioData(buf)))
    .then(decoded => {
      peaks = computePeaks(decoded, BAR_COUNT);
      canvas.width = BAR_COUNT * (BAR_WIDTH + BAR_GAP);
      const isActive = useSync ? (sync.players.get(playerId)?.active || false) : simpleActive;
      drawWaveform(canvas.getContext('2d'), peaks, 0, color, height, isActive);
      if (useSync && sync.players.has(playerId)) {
        sync.players.get(playerId).peaks = peaks;
      }
      if (!useSync && audio._startIdle) audio._startIdle();
    })
    .catch(err => {
      if (err.name === 'AbortError') return;
      peaks = Array.from({ length: BAR_COUNT }, () => 0.2 + Math.random() * 0.6);
      canvas.width = BAR_COUNT * (BAR_WIDTH + BAR_GAP);
      drawWaveform(canvas.getContext('2d'), peaks, 0, color, height, false);
      if (useSync && sync.players.has(playerId)) {
        sync.players.get(playerId).peaks = peaks;
      }
      if (!useSync && audio._startIdle) audio._startIdle();
    });

  if (useSync && sync.enabled) {
    // Register with sync manager
    sync.players.set(playerId, {
      audio, peaks, canvas, color, height, active: false, ac,
    });
    // Start tick loop for idle pulse even if no player is active yet
    if (!sync.animFrameId) tickLoop();

    // Looping via ended event
    audio.addEventListener('ended', () => {
      const p = sync.players.get(playerId);
      if (p && p.active && sync.running) {
        const pos = getClockPosition();
        audio.currentTime = pos % (audio.duration || sync.duration);
        safePlay(audio);
      }
    }, { signal });

    // Click canvas to toggle
    canvas.addEventListener('click', () => togglePlayer(playerId), { signal });
  } else {
    // Simple independent play/pause (feed cards)
    let animId = null;
    let waitFrames = 0;
    const MAX_WAIT_FRAMES = 300; // ~5 seconds at 60fps
    let idleId = null;
    let idleRunning = false;

    function idleTick() {
      if (!peaks || simpleActive) { idleId = null; idleRunning = false; return; }
      const time = performance.now() / 1000;
      drawWaveform(canvas.getContext('2d'), peaks, 0, color, height, false, time);
      idleId = requestAnimationFrame(idleTick);
    }

    function startIdle() {
      if (idleRunning || simpleActive) return;
      idleRunning = true;
      idleTick();
    }

    function stopIdle() {
      if (idleId) { cancelAnimationFrame(idleId); idleId = null; }
      idleRunning = false;
    }

    function simpleTick() {
      if (!peaks || !audio.duration) {
        waitFrames++;
        if (waitFrames < MAX_WAIT_FRAMES && !audio.paused) {
          animId = requestAnimationFrame(simpleTick);
        } else {
          animId = null;
        }
        return;
      }
      waitFrames = 0;
      const progress = audio.currentTime / audio.duration;
      const time = performance.now() / 1000;
      drawWaveform(canvas.getContext('2d'), peaks, progress, color, height, true, time);
      if (!audio.paused) {
        animId = requestAnimationFrame(simpleTick);
      } else {
        animId = null;
      }
    }

    audio.addEventListener('play', () => {
      stopIdle();
      if (!simpleActive) {
        simpleActive = true;
        waitFrames = 0;
        simpleTick();
      }
    }, { signal });

    if (!opts.noClick) {
      canvas.addEventListener('click', () => {
        if (audio.paused) {
          stopIdle();
          simpleActive = true;
          waitFrames = 0;
          safePlay(audio);
          simpleTick();
        } else {
          audio.pause();
          simpleActive = false;
          startIdle();
        }
      }, { signal });
    }

    audio.addEventListener('ended', () => {
      simpleActive = false;
      startIdle();
    }, { signal });

    audio.addEventListener('pause', () => {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
    }, { signal });

    // External control for feed autoplay
    audio.feedPlay = () => {
      if (audio.paused) {
        stopIdle();
        simpleActive = true;
        waitFrames = 0;
        safePlay(audio);
        simpleTick();
      }
    };

    audio.feedStop = () => {
      audio.pause();
      audio.currentTime = 0;
      simpleActive = false;
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      startIdle();
    };

    // Start idle pulse once peaks are ready (handled in fetch callback below)
    audio._startIdle = startIdle;
  }

  // Store AbortController on audio element for clearPlayers()
  audio._playerAc = ac;

  wrapper.appendChild(audio);
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);
  return audio;
}

export function clearPlayers() {
  // Stop all synced players
  clearSync();
  // Also stop any stray audio elements
  document.querySelectorAll('.audio-player audio').forEach(a => {
    a.pause();
    if (a._playerAc) a._playerAc.abort();
    a.removeAttribute('src');
    a.load();
  });
}
