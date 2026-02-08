import * as api from './api.js';
import * as audioPlayer from './audio-player.js';
import { navigate } from './router.js';
import { timeAgo } from './ui.js';

let currentPage = 1;

export function render(container) {
  container.innerHTML = '<div class="feed-loading">Loading...</div>';
  loadFeed(container, 1);
}

async function loadFeed(container, page) {
  try {
    const data = await api.getFeed(page);
    currentPage = page;
    container.innerHTML = '';

    if (data.posts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No posts yet</p>
          <p class="dim">Tap + to create the first one</p>
        </div>`;
      return;
    }

    for (const post of data.posts) {
      container.appendChild(createPostCard(post, container, page));
    }

    if (data.pages > 1) {
      const pager = document.createElement('div');
      pager.className = 'pagination';
      if (page > 1) {
        const prev = document.createElement('button');
        prev.textContent = 'Newer';
        prev.addEventListener('click', () => loadFeed(container, page - 1));
        pager.appendChild(prev);
      }
      const info = document.createElement('span');
      info.className = 'page-info';
      info.textContent = `${page} / ${data.pages}`;
      pager.appendChild(info);
      if (page < data.pages) {
        const next = document.createElement('button');
        next.textContent = 'Older';
        next.addEventListener('click', () => loadFeed(container, page + 1));
        pager.appendChild(next);
      }
      container.appendChild(pager);
    }
  } catch (e) {
    container.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
}

function createPostCard(post) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post-card-wrapper';

  // Header row: @username ... time (above card)
  const headerRow = document.createElement('div');
  headerRow.className = 'post-card-header';
  const username = document.createElement('a');
  username.className = 'username-link';
  username.textContent = `${post.username}`;
  username.href = `#/profile/${post.username}`;
  headerRow.appendChild(username);
  const time = document.createElement('span');
  time.className = 'time-ago';
  time.textContent = timeAgo(post.created_at);
  headerRow.appendChild(time);
  wrapper.appendChild(headerRow);

  // Card row: card + star column
  const cardRow = document.createElement('div');
  cardRow.className = 'post-card-row';

  const card = document.createElement('div');
  card.className = 'post-card';
  card.style.boxShadow = `0 0 30px ${post.color_hex}20, 0 0 60px ${post.color_hex}10`;

  // Image container with overlay
  const imageContainer = document.createElement('div');
  imageContainer.className = 'post-card-image-container';

  const img = document.createElement('img');
  img.className = 'post-card-image';
  img.src = post.image_url;
  img.alt = 'Post image';
  img.loading = 'lazy';
  img.addEventListener('click', () => navigate(`/post/${post.id}`));
  imageContainer.appendChild(img);

  // Color overlay
  const colorOverlay = document.createElement('div');
  colorOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0.15;';
  colorOverlay.style.background = post.color_hex;
  imageContainer.appendChild(colorOverlay);

  // Waveform overlay on image
  const audioDiv = document.createElement('div');
  audioPlayer.createPlayer(post.audio_url, audioDiv, post.color_hex, { overlay: true });
  imageContainer.appendChild(audioDiv);

  card.appendChild(imageContainer);
  cardRow.appendChild(card);

  // Star column
  const starCol = document.createElement('div');
  starCol.className = 'post-card-star-col';
  starCol.innerHTML = `<span class="star-icon">★</span><span class="star-count">${post.comment_count}</span>`;
  starCol.style.cursor = 'pointer';
  starCol.addEventListener('click', () => navigate(`/post/${post.id}`));
  cardRow.appendChild(starCol);

  wrapper.appendChild(cardRow);
  return wrapper;
}
