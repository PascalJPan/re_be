export function show(id) {
  document.getElementById(id).style.display = '';
}

export function hide(id) {
  document.getElementById(id).style.display = 'none';
}

export function showLoading(msg) {
  const el = document.getElementById('loading');
  if (el) {
    el.textContent = msg || 'Processing...';
    el.style.display = '';
  }
}

export function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
}

export function showError(msg) {
  toast(msg, true);
}

export function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' toast-error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-visible'));
  setTimeout(() => {
    el.classList.remove('toast-visible');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

export function timeAgo(isoStr) {
  const date = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z');
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}
