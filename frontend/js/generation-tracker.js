import * as api from './api.js';
import { toast } from './ui.js';
import { navigate } from './router.js';

const POLL_INTERVAL = 3000;

// Map<postId, { colorHex, intervalId }>
const generating = new Map();
const listeners = [];

export function addGeneratingPost(postId, colorHex) {
  if (generating.has(postId)) return;

  const intervalId = setInterval(() => pollStatus(postId), POLL_INTERVAL);
  generating.set(postId, { colorHex, intervalId });
}

export function isGenerating(postId) {
  return generating.has(postId);
}

export function getGeneratingPosts() {
  return new Map(generating);
}

export function onStatusChange(callback) {
  listeners.push(callback);
}

function notifyListeners(postId, status) {
  for (const cb of listeners) {
    try { cb(postId, status); } catch (e) { console.error(e); }
  }
}

async function pollStatus(postId) {
  try {
    const data = await api.getPostStatus(postId);

    if (data.status === 'ready') {
      clearTracking(postId);
      notifyListeners(postId, 'ready');
      toast('Post ready!', false, () => navigate(`/post/${postId}`));
    } else if (data.status === 'failed') {
      clearTracking(postId);
      notifyListeners(postId, 'failed');
      toast(data.error_message || 'Post generation failed', true);
    }
    // 'generating' — keep polling
  } catch (e) {
    // Network error — keep polling, don't remove
    console.warn('Poll failed for', postId, e);
  }
}

function clearTracking(postId) {
  const entry = generating.get(postId);
  if (entry) {
    clearInterval(entry.intervalId);
    generating.delete(postId);
  }
}
