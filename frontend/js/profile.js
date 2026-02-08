import * as api from './api.js';
import { navigate } from './router.js';
import { timeAgo } from './ui.js';

export function render(container, username) {
  container.innerHTML = '<div class="feed-loading">Loading...</div>';
  loadProfile(container, username, 1);
}

async function loadProfile(container, username, page) {
  try {
    const data = await api.getProfile(username, page);
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'profile-header';
    const name = document.createElement('h2');
    name.textContent = `${data.user.username}`;
    header.appendChild(name);
    const count = document.createElement('span');
    count.className = 'dim';
    count.textContent = `${data.total} post${data.total !== 1 ? 's' : ''}`;
    header.appendChild(count);
    container.appendChild(header);

    if (data.posts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<p>No posts yet</p>';
      container.appendChild(empty);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'profile-grid';

    for (const post of data.posts) {
      const cell = document.createElement('div');
      cell.className = 'profile-grid-item';
      cell.style.boxShadow = '0 2px 12px ' + post.color_hex + '20';

      const img = document.createElement('img');
      img.src = post.image_url;
      img.alt = '';
      img.loading = 'lazy';
      cell.appendChild(img);

      const colorOverlay = document.createElement('div');
      colorOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0.15;';
      colorOverlay.style.background = post.color_hex;
      cell.appendChild(colorOverlay);

      const overlay = document.createElement('div');
      overlay.className = 'profile-grid-overlay';
      overlay.textContent = post.comment_count > 0 ? `${post.comment_count}` : '';
      cell.appendChild(overlay);

      cell.addEventListener('click', () => navigate(`/post/${post.id}`));
      grid.appendChild(cell);
    }

    container.appendChild(grid);

    if (data.pages > 1) {
      const pager = document.createElement('div');
      pager.className = 'pagination';
      if (page > 1) {
        const prev = document.createElement('button');
        prev.textContent = 'Newer';
        prev.addEventListener('click', () => loadProfile(container, username, page - 1));
        pager.appendChild(prev);
      }
      const info = document.createElement('span');
      info.className = 'page-info';
      info.textContent = `${page} / ${data.pages}`;
      pager.appendChild(info);
      if (page < data.pages) {
        const next = document.createElement('button');
        next.textContent = 'Older';
        next.addEventListener('click', () => loadProfile(container, username, page + 1));
        pager.appendChild(next);
      }
      container.appendChild(pager);
    }
  } catch (e) {
    container.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
}
