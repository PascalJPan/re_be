import { getUser } from './auth.js';

// Derive base so fetch URLs resolve relative to the page origin.
// Hash routing keeps location.pathname constant, e.g. "/creations/re_be/"
// in production and "/" in local dev — both work.
const _base = window.location.pathname.replace(/\/?$/, '/');
const API_BASE = `${_base}api`;

async function request(url, options = {}) {
  const user = getUser();
  if (user) {
    const headers = options.headers instanceof Headers
      ? options.headers
      : new Headers(options.headers || {});
    headers.set('X-Username', user.username);
    options.headers = headers;
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Auth
export async function verifyPasscode(code) {
  return request(`${API_BASE}/auth/verify?code=${encodeURIComponent(code)}`);
}

// Posts
export async function getFeed(page = 1) {
  return request(`${API_BASE}/posts?page=${page}`);
}

export async function getPost(id) {
  return request(`${API_BASE}/posts/${id}`);
}

export async function getRandomPost(excludeId) {
  const q = excludeId ? `?exclude=${excludeId}` : '';
  return request(`${API_BASE}/posts/random${q}`);
}

export async function getPostStatus(id) {
  return request(`${API_BASE}/posts/${id}/status`);
}

export async function createPost(imageFile, colorHex, squigglePoints) {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('color_hex', colorHex);
  form.append('squiggle_points', JSON.stringify(squigglePoints));

  return request(`${API_BASE}/posts`, {
    method: 'POST',
    body: form,
  });
}

export async function deletePost(id) {
  return request(`${API_BASE}/posts/${id}`, {
    method: 'DELETE',
  });
}

export async function recreatePost(id) {
  return request(`${API_BASE}/posts/${id}/recreate`, { method: 'POST' });
}

// Comments
export async function getComments(postId) {
  return request(`${API_BASE}/posts/${postId}/comments`);
}

export async function createComment(postId, imageFile, colorHex, squigglePoints) {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('color_hex', colorHex);
  form.append('squiggle_points', JSON.stringify(squigglePoints));

  return request(`${API_BASE}/posts/${postId}/comments`, {
    method: 'POST',
    body: form,
  });
}

export async function getCommentStatus(commentId) {
  return request(`${API_BASE}/comments/${commentId}/status`);
}

export async function deleteComment(postId, commentId) {
  return request(`${API_BASE}/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
  });
}

// Profile
export async function getProfile(username, page = 1) {
  return request(`${API_BASE}/users/${username}?page=${page}`);
}
