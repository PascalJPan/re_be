const API_BASE = '/api';

export async function createPost(imageFile, colorHex, squigglePoints) {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('color_hex', colorHex);
  form.append('squiggle_points', JSON.stringify(squigglePoints));

  const res = await fetch(`${API_BASE}/posts`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create post');
  }
  return res.json();
}

export async function getCurrentPost() {
  const res = await fetch(`${API_BASE}/posts/current`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch post');
  return res.json();
}

export async function createComment(imageFile, colorHex, squigglePoints) {
  const form = new FormData();
  form.append('image', imageFile);
  form.append('color_hex', colorHex);
  form.append('squiggle_points', JSON.stringify(squigglePoints));

  const res = await fetch(`${API_BASE}/comments`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create comment');
  }
  return res.json();
}

export async function getComments() {
  const res = await fetch(`${API_BASE}/comments`);
  if (!res.ok) throw new Error('Failed to fetch comments');
  return res.json();
}

export async function resetAll() {
  const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset');
  return res.json();
}
