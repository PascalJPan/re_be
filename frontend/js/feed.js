import * as api from './api.js';
import * as audioPlayer from './audio-player.js';
import { navigate } from './router.js';
import { timeAgo } from './ui.js';
import { onStatusChange, offStatusChange } from './generation-tracker.js';
import * as feedParticles from './feed-particles.js';

let observer = null;
let currentlyPlaying = null;
let statusUnsub = null;
let scrollHandler = null;
let prefetchedPost = null;
let swiping = false;

export function render(container) {
  container.innerHTML = '<div class="feed-loading">Loading...</div>';
  container.classList.add('feed-scroll');

  feedParticles.init();

  // Subscribe to generation status changes to re-render feed
  statusUnsub = (postId, status) => {
    cleanup(container);
    container.classList.add('feed-scroll');
    feedParticles.init();
    loadFeed(container, 1);
  };
  onStatusChange(statusUnsub);

  loadFeed(container, 1);
  return () => cleanup(container);
}

function cleanup(container) {
  container.classList.remove('feed-scroll');
  if (statusUnsub) { offStatusChange(statusUnsub); statusUnsub = null; }
  if (observer) { observer.disconnect(); observer = null; }
  if (scrollHandler) { container.removeEventListener('scroll', scrollHandler); scrollHandler = null; }
  if (currentlyPlaying) {
    currentlyPlaying.feedStop();
    currentlyPlaying = null;
  }
  audioPlayer.clearPlayers();
  feedParticles.destroy();
  prefetchedPost = null;
  swiping = false;
}

async function loadFeed(container, page) {
  try {
    const data = await api.getFeed(page);
    container.innerHTML = '';

    if (data.posts.length === 0) {
      container.classList.remove('feed-scroll');
      feedParticles.destroy();
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
      items.push({ wrapper, audio, post });
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
          feedParticles.init();
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
          feedParticles.init();
          loadFeed(container, page + 1);
        });
        pager.appendChild(next);
      }
      container.appendChild(pager);
    }

    // Set initial particle color from first post
    const firstReady = data.posts.find(p => p.status === 'ready');
    if (firstReady) {
      feedParticles.setActivePost(firstReady.color_hex, firstReady.bpm);
    }

    // Scroll wind listener
    let lastScrollTop = container.scrollTop;
    scrollHandler = () => {
      const delta = container.scrollTop - lastScrollTop;
      lastScrollTop = container.scrollTop;
      feedParticles.applyScrollForce(delta);
    };
    container.addEventListener('scroll', scrollHandler, { passive: true });

    setupAutoplay(items, container);

    // Start prefetch for random post
    triggerPrefetch(firstReady ? firstReady.id : null);
  } catch (e) {
    const errDiv = document.createElement('div');
    errDiv.className = 'error-msg';
    errDiv.textContent = e.message;
    container.innerHTML = '';
    container.appendChild(errDiv);
  }
}

function triggerPrefetch(excludeId) {
  prefetchedPost = null;
  api.getRandomPost(excludeId).then(post => {
    prefetchedPost = post;
    // Preload the image
    if (post && post.image_url) {
      const img = new Image();
      img.src = post.image_url;
    }
  }).catch(() => {
    prefetchedPost = null;
  });
}

function setupAutoplay(items, container) {
  if (observer) observer.disconnect();

  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        const audio = entry.target._feedAudio;
        const color = entry.target._feedColor;
        const postBpm = entry.target._feedBpm;

        if (color) {
          feedParticles.setActivePost(color, postBpm);
        }

        if (audio && audio !== currentlyPlaying) {
          if (currentlyPlaying) currentlyPlaying.feedStop();
          currentlyPlaying = audio;
          audio.feedPlay();
          feedParticles.setPlaying(true);
        }
      }
    }
  }, { threshold: 0.6 });

  for (const { wrapper, audio, post } of items) {
    wrapper._feedColor = post.color_hex;
    wrapper._feedBpm = post.bpm || null;
    if (audio) {
      wrapper._feedAudio = audio;
    }
    observer.observe(wrapper);
  }

  // Set up swipe detection on each wrapper
  for (const { wrapper } of items) {
    setupSwipe(wrapper, container);
  }
}

function setupSwipe(wrapper, container) {
  let startX = 0, startY = 0, deltaX = 0, tracking = false, isHorizontal = null;

  function onStart(e) {
    if (swiping) return;
    // Don't capture swipe if post is generating/failed
    if (wrapper.classList.contains('post-card-generating')) return;
    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    startY = touch.clientY;
    deltaX = 0;
    tracking = true;
    isHorizontal = null;
    wrapper.style.transition = 'none';
  }

  function onMove(e) {
    if (!tracking || swiping) return;
    const touch = e.touches ? e.touches[0] : e;
    deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    // Decide direction once we have enough movement
    if (isHorizontal === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
    }

    if (isHorizontal) {
      e.preventDefault();
      // Visual drag feedback — cap at ~40% of width
      const maxDrag = wrapper.offsetWidth * 0.4;
      const clamped = Math.max(-maxDrag, Math.min(maxDrag, deltaX));
      const opacity = 1 - Math.abs(clamped) / wrapper.offsetWidth * 0.5;
      wrapper.style.transform = `translateX(${clamped}px)`;
      wrapper.style.opacity = opacity;
    }
  }

  function onEnd() {
    if (!tracking || swiping) { tracking = false; return; }
    tracking = false;

    if (isHorizontal && Math.abs(deltaX) > 80) {
      // Trigger swipe
      performSwipe(wrapper, container, deltaX > 0 ? 'right' : 'left');
    } else {
      // Snap back
      wrapper.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
      wrapper.style.transform = '';
      wrapper.style.opacity = '';
    }
  }

  // Touch events
  wrapper.addEventListener('touchstart', onStart, { passive: true });
  wrapper.addEventListener('touchmove', onMove, { passive: false });
  wrapper.addEventListener('touchend', onEnd);

  // Mouse events for desktop
  wrapper.addEventListener('mousedown', (e) => {
    // Only left button, and not on links
    if (e.button !== 0) return;
    if (e.target.closest('a')) return;
    onStart(e);
    const onMouseMove = (ev) => onMove(ev);
    const onMouseUp = () => {
      onEnd();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

async function performSwipe(wrapper, container, direction) {
  swiping = true;

  // Stop audio on current card
  if (currentlyPlaying) {
    currentlyPlaying.feedStop();
    currentlyPlaying = null;
    feedParticles.setPlaying(false);
  }

  // Use prefetched or fetch fresh
  let newPost = prefetchedPost;
  prefetchedPost = null;

  if (!newPost) {
    try {
      const currentId = wrapper._feedColor ? wrapper.querySelector('.post-card-info-star')?.href?.split('/').pop() : null;
      newPost = await api.getRandomPost(currentId);
    } catch {
      // No other posts — snap back
      wrapper.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
      wrapper.style.transform = '';
      wrapper.style.opacity = '';
      swiping = false;
      return;
    }
  }

  // Slide current card out
  wrapper.style.transition = '';
  const outClass = direction === 'left' ? 'swipe-out-left' : 'swipe-out-right';
  wrapper.classList.add(outClass);

  // Build new card
  const { wrapper: newWrapper, audio: newAudio } = createPostCard(newPost);
  newWrapper._feedColor = newPost.color_hex;
  newWrapper._feedBpm = newPost.bpm || null;

  // Position new card off-screen on opposite side
  const inClass = direction === 'left' ? 'swipe-in-right' : 'swipe-in-left';
  newWrapper.classList.add(inClass);

  // Wait for slide-out animation
  await new Promise(r => setTimeout(r, 300));

  // Replace wrapper in DOM
  const parent = wrapper.parentNode;
  if (!parent) { swiping = false; return; }
  parent.insertBefore(newWrapper, wrapper);
  wrapper.remove();

  // Unobserve old, observe new
  if (observer) {
    observer.unobserve(wrapper);
    if (newAudio) newWrapper._feedAudio = newAudio;
    observer.observe(newWrapper);
  }

  // Trigger slide-in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      newWrapper.classList.remove(inClass);
      newWrapper.classList.add('swipe-in-active');

      // Update particles
      feedParticles.setActivePost(newPost.color_hex, newPost.bpm);

      // Auto-play new post audio
      if (newAudio) {
        currentlyPlaying = newAudio;
        newAudio.feedPlay();
        feedParticles.setPlaying(true);
      }

      // Clean up animation classes after transition
      setTimeout(() => {
        newWrapper.classList.remove('swipe-in-active');
        newWrapper.style.transform = '';
        newWrapper.style.opacity = '';
        swiping = false;

        // Set up swipe on new card
        setupSwipe(newWrapper, container);

        // Prefetch next
        triggerPrefetch(newPost.id);
      }, 320);
    });
  });
}

function createPostCard(post) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post-card-wrapper';

  // Generating or failed state — show placeholder
  if (post.status !== 'ready') {
    wrapper.classList.add('post-card-generating');

    const card = document.createElement('div');
    card.className = 'post-card';
    card.style.boxShadow = `0 0 30px ${post.color_hex}20, 0 0 60px ${post.color_hex}10`;

    const placeholder = document.createElement('div');
    placeholder.className = 'post-card-placeholder';
    placeholder.style.background = post.color_hex;

    if (post.status === 'failed') {
      placeholder.style.opacity = '0.5';
      const label = document.createElement('span');
      label.className = 'generating-label';
      label.textContent = 'failed';
      placeholder.appendChild(label);
    } else {
      const shimmer = document.createElement('div');
      shimmer.className = 'shimmer-overlay';
      placeholder.appendChild(shimmer);

      const label = document.createElement('span');
      label.className = 'generating-label';
      label.textContent = 'generating...';
      placeholder.appendChild(label);
    }

    card.appendChild(placeholder);
    wrapper.appendChild(card);
    return { wrapper, audio: null };
  }

  // Ready state — normal rendering
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
      feedParticles.setPlaying(false);
    } else {
      if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.feedStop();
      currentlyPlaying = audio;
      audio.feedPlay();
      feedParticles.setPlaying(true);
    }
  });

  card.appendChild(imageContainer);
  wrapper.appendChild(card);

  return { wrapper, audio };
}
