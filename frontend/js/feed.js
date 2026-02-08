import * as api from './api.js';
import * as audioPlayer from './audio-player.js';
import { navigate } from './router.js';
import { timeAgo } from './ui.js';

let observer = null;
let currentlyPlaying = null;

export function render(container) {
  container.innerHTML = '<div class="feed-loading">Loading...</div>';
  container.classList.add('feed-scroll');
  loadFeed(container, 1);
  return () => cleanup(container);
}

function cleanup(container) {
  container.classList.remove('feed-scroll');
  if (observer) { observer.disconnect(); observer = null; }
  if (currentlyPlaying) {
    currentlyPlaying.feedStop();
    currentlyPlaying = null;
  }
  audioPlayer.clearPlayers();
}

async function loadFeed(container, page) {
  try {
    const data = await api.getFeed(page);
    container.innerHTML = '';

    if (data.posts.length === 0) {
      container.classList.remove('feed-scroll');
      container.innerHTML = `
        <div class="empty-state">
          <p>No posts yet</p>
          <p class="dim">Tap + to create the first one</p>
        </div>`;
      return;
    }

    const items = [];

    for (const post of data.posts) {
      const { wrapper, audio } = createPostCard(post);
      container.appendChild(wrapper);
      items.push({ wrapper, audio });
    }

    if (data.pages > 1) {
      const pager = document.createElement('div');
      pager.className = 'feed-pagination-snap';
      if (page > 1) {
        const prev = document.createElement('button');
        prev.textContent = 'Newer';
        prev.addEventListener('click', () => {
          cleanup(container);
          container.classList.add('feed-scroll');
          loadFeed(container, page - 1);
        });
        pager.appendChild(prev);
      }
      const info = document.createElement('span');
      info.className = 'page-info';
      info.textContent = `${page} / ${data.pages}`;
      pager.appendChild(info);
      if (page < data.pages) {
        const next = document.createElement('button');
        next.textContent = 'Older';
        next.addEventListener('click', () => {
          cleanup(container);
          container.classList.add('feed-scroll');
          loadFeed(container, page + 1);
        });
        pager.appendChild(next);
      }
      container.appendChild(pager);
    }

    setupAutoplay(items);
  } catch (e) {
    container.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
}

function setupAutoplay(items) {
  if (observer) observer.disconnect();

  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        const audio = entry.target._feedAudio;
        if (audio && audio !== currentlyPlaying) {
          if (currentlyPlaying) currentlyPlaying.feedStop();
          currentlyPlaying = audio;
          audio.feedPlay();
        }
      }
    }
  }, { threshold: 0.6 });

  for (const { wrapper, audio } of items) {
    wrapper._feedAudio = audio;
    observer.observe(wrapper);
  }
}

function createPostCard(post) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post-card-wrapper';

  const card = document.createElement('div');
  card.className = 'post-card';
  card.style.boxShadow = `0 0 30px ${post.color_hex}20, 0 0 60px ${post.color_hex}10`;

  const imageContainer = document.createElement('div');
  imageContainer.className = 'post-card-image-container';

  const img = document.createElement('img');
  img.className = 'post-card-image';
  img.src = post.image_url;
  img.alt = 'Post image';
  img.loading = 'lazy';
  imageContainer.appendChild(img);

  // Color overlay
  const colorOverlay = document.createElement('div');
  colorOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0.15;';
  colorOverlay.style.background = post.color_hex;
  imageContainer.appendChild(colorOverlay);

  // Waveform overlay (noClick — handled by imageContainer)
  const audioDiv = document.createElement('div');
  const audio = audioPlayer.createPlayer(post.audio_url, audioDiv, post.color_hex, { overlay: true, noClick: true });
  imageContainer.appendChild(audioDiv);

  // Info overlay at bottom of image
  const infoOverlay = document.createElement('div');
  infoOverlay.className = 'post-card-info';

  const username = document.createElement('a');
  username.className = 'post-card-info-username';
  username.textContent = post.username;
  username.href = `#/profile/${post.username}`;
  username.addEventListener('click', (e) => e.stopPropagation());

  const right = document.createElement('div');
  right.className = 'post-card-info-right';

  const star = document.createElement('a');
  star.className = 'post-card-info-star';
  star.innerHTML = `&#9733; ${post.comment_count}`;
  star.href = `#/post/${post.id}`;
  star.addEventListener('click', (e) => e.stopPropagation());

  const time = document.createElement('span');
  time.className = 'post-card-info-time';
  time.textContent = timeAgo(post.created_at);

  right.appendChild(star);
  right.appendChild(time);
  infoOverlay.appendChild(username);
  infoOverlay.appendChild(right);
  imageContainer.appendChild(infoOverlay);

  // Click anywhere on image to toggle audio
  imageContainer.addEventListener('click', () => {
    if (!audio) return;
    if (!audio.paused) {
      audio.feedStop();
      currentlyPlaying = null;
    } else {
      if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.feedStop();
      currentlyPlaying = audio;
      audio.feedPlay();
    }
  });

  card.appendChild(imageContainer);
  wrapper.appendChild(card);

  return { wrapper, audio };
}
