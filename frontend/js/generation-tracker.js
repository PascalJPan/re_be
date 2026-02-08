import * as api from './api.js';
import { toast } from './ui.js';
import { navigate } from './router.js';

const POLL_INTERVAL = 3000;

// ==================== Post tracking ====================
// Map<postId, { colorHex, intervalId }>
const generating = new Map();
const listeners = [];

export function addGeneratingPost(postId, colorHex) {
  if (generating.has(postId)) return;

  const intervalId = setInterval(() => pollPostStatus(postId), POLL_INTERVAL);
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

export function offStatusChange(callback) {
  const idx = listeners.indexOf(callback);
  if (idx !== -1) listeners.splice(idx, 1);
}

function notifyPostListeners(postId, status) {
  for (const cb of [...listeners]) {
    try { cb(postId, status); } catch (e) { console.error(e); }
  }
}

async function pollPostStatus(postId) {
  try {
    const data = await api.getPostStatus(postId);

    if (data.status === 'ready') {
      clearPostTracking(postId);
      notifyPostListeners(postId, 'ready');
      toast('Post ready!', false, () => navigate(`/post/${postId}`));
    } else if (data.status === 'failed') {
      clearPostTracking(postId);
      notifyPostListeners(postId, 'failed');
      toast(data.error_message || 'Post generation failed', true);
    }
  } catch (e) {
    console.warn('Poll failed for post', postId, e);
  }
}

function clearPostTracking(postId) {
  const entry = generating.get(postId);
  if (entry) {
    clearInterval(entry.intervalId);
    generating.delete(postId);
  }
}

// ==================== Comment tracking ====================
// Map<commentId, { postId, colorHex, intervalId }>
const generatingComments = new Map();
const commentListeners = [];

export function addGeneratingComment(commentId, postId, colorHex) {
  if (generatingComments.has(commentId)) return;

  const intervalId = setInterval(() => pollCommentStatus(commentId), POLL_INTERVAL);
  generatingComments.set(commentId, { postId, colorHex, intervalId });
}

export function isCommentGenerating(commentId) {
  return generatingComments.has(commentId);
}

export function getGeneratingComments() {
  return new Map(generatingComments);
}

export function getGeneratingCommentsForPost(postId) {
  const result = new Map();
  for (const [id, entry] of generatingComments) {
    if (entry.postId === postId) result.set(id, entry);
  }
  return result;
}

export function onCommentStatusChange(callback) {
  commentListeners.push(callback);
}

export function offCommentStatusChange(callback) {
  const idx = commentListeners.indexOf(callback);
  if (idx !== -1) commentListeners.splice(idx, 1);
}

function notifyCommentListeners(commentId, postId, status) {
  for (const cb of [...commentListeners]) {
    try { cb(commentId, postId, status); } catch (e) { console.error(e); }
  }
}

async function pollCommentStatus(commentId) {
  try {
    const data = await api.getCommentStatus(commentId);
    const entry = generatingComments.get(commentId);
    const postId = entry ? entry.postId : '';

    if (data.status === 'ready') {
      clearCommentTracking(commentId);
      notifyCommentListeners(commentId, postId, 'ready');
      toast('Comment ready!', false, () => navigate(`/post/${postId}`));
    } else if (data.status === 'failed') {
      clearCommentTracking(commentId);
      notifyCommentListeners(commentId, postId, 'failed');
      toast(data.error_message || 'Comment generation failed', true);
    }
  } catch (e) {
    console.warn('Poll failed for comment', commentId, e);
  }
}

function clearCommentTracking(commentId) {
  const entry = generatingComments.get(commentId);
  if (entry) {
    clearInterval(entry.intervalId);
    generatingComments.delete(commentId);
  }
}
