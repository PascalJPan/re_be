import * as api from './api.js';
import { getUser, isAdmin } from './auth.js';
import { navigate } from './router.js';
import { timeAgo, toast } from './ui.js';
import { addGeneratingPost, onStatusChange, offStatusChange } from './generation-tracker.js';

let activeCloseHandler = null;
let statusUnsub = null;

export function render(container, username) {
  container.innerHTML = '<div class="feed-loading">Loading...</div>';

  // Subscribe to generation status changes to re-render profile
  statusUnsub = (postId, status) => {
    loadProfile(container, username, 1);
  };
  onStatusChange(statusUnsub);

  loadProfile(container, username, 1);

  // Cleanup: remove any open menus and their document-level click listeners
  return () => {
    if (statusUnsub) { offStatusChange(statusUnsub); statusUnsub = null; }
    if (activeCloseHandler) {
      document.removeEventListener('click', activeCloseHandler);
      activeCloseHandler = null;
    }
    document.querySelectorAll('.profile-grid-menu').forEach(m => m.remove());
  };
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

    const isOwnProfile = isAdmin() && getUser().username === data.user.username;

    const grid = document.createElement('div');
    grid.className = 'profile-grid';

    for (const post of data.posts) {
      const cell = document.createElement('div');
      cell.className = 'profile-grid-item';
      cell.style.boxShadow = '0 2px 12px ' + post.color_hex + '20';

      // Generating/failed state — colored placeholder
      if (post.status && post.status !== 'ready') {
        cell.style.background = post.color_hex;
        cell.style.cursor = 'default';

        if (post.status === 'failed') {
          cell.style.opacity = '0.5';
          const label = document.createElement('span');
          label.className = 'generating-label';
          label.textContent = 'failed';
          cell.appendChild(label);
        } else {
          const shimmer = document.createElement('div');
          shimmer.className = 'shimmer-overlay';
          cell.appendChild(shimmer);
          const label = document.createElement('span');
          label.className = 'generating-label';
          label.textContent = 'generating...';
          cell.appendChild(label);
        }

        if (isOwnProfile) {
          const menuBtn = document.createElement('button');
          menuBtn.className = 'profile-grid-menu-btn';
          menuBtn.textContent = '\u2026';
          menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPostMenu(cell, post.id, container, username, page);
          });
          cell.appendChild(menuBtn);
        }

        grid.appendChild(cell);
        continue;
      }

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

      if (isOwnProfile) {
        const menuBtn = document.createElement('button');
        menuBtn.className = 'profile-grid-menu-btn';
        menuBtn.textContent = '\u2026';
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showPostMenu(cell, post.id, container, username, page);
        });
        cell.appendChild(menuBtn);
      }

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
    const errDiv = document.createElement('div');
    errDiv.className = 'error-msg';
    errDiv.textContent = e.message;
    container.innerHTML = '';
    container.appendChild(errDiv);
  }
}

function showPostMenu(cell, postId, container, username, page) {
  if (activeCloseHandler) {
    document.removeEventListener('click', activeCloseHandler);
    activeCloseHandler = null;
  }
  document.querySelectorAll('.profile-grid-menu').forEach(m => m.remove());

  const menu = document.createElement('div');
  menu.className = 'profile-grid-menu';

  const recreateBtn = document.createElement('button');
  recreateBtn.className = 'profile-grid-menu-recreate';
  recreateBtn.textContent = 'Recreate';
  recreateBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    menu.remove();

    try {
      const result = await api.recreatePost(postId);
      addGeneratingPost(postId, result.color_hex);
      loadProfile(container, username, page);
    } catch (err) {
      toast(err.message, true);
    }
  });
  menu.appendChild(recreateBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    menu.remove();
    try {
      await api.deletePost(postId);
      loadProfile(container, username, page);
    } catch (err) {
      toast(err.message, true);
    }
  });
  menu.appendChild(deleteBtn);
  cell.appendChild(menu);

  const close = (e) => {
    if (!menu.parentNode || !menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', close);
      activeCloseHandler = null;
    }
  };
  activeCloseHandler = close;
  setTimeout(() => document.addEventListener('click', close), 0);
}
