import * as api from './api.js';
import * as audioPlayer from './audio-player.js';
import { navigate } from './router.js';
import { timeAgo, toast } from './ui.js';
import { openCreateOverlay } from './create-flow.js';
import { onCommentStatusChange, offCommentStatusChange } from './generation-tracker.js';
import { isAdmin } from './auth.js';

let commentStatusHandler = null;

export function render(container, postId) {
  container.innerHTML = '<div class="feed-loading">Loading...</div>';
  loadPost(container, postId);
  return () => {
    audioPlayer.clearPlayers();
    if (commentStatusHandler) {
      offCommentStatusChange(commentStatusHandler);
      commentStatusHandler = null;
    }
  };
}

async function loadPost(container, postId) {
  try {
    const post = await api.getPost(postId);
    container.innerHTML = '';

    // Clean up previous listener if re-loading
    if (commentStatusHandler) {
      offCommentStatusChange(commentStatusHandler);
      commentStatusHandler = null;
    }

    // Back button (arrow only)
    const back = document.createElement('button');
    back.className = 'back-btn';
    back.textContent = '\u2190';
    back.addEventListener('click', () => navigate('/feed'));
    container.appendChild(back);

    // Header row: @username ... time
    const headerRow = document.createElement('div');
    headerRow.className = 'detail-header-row';
    const username = document.createElement('a');
    username.className = 'username-link';
    username.textContent = `${post.username}`;
    username.href = `#/profile/${post.username}`;
    headerRow.appendChild(username);
    const time = document.createElement('span');
    time.className = 'time-ago';
    time.textContent = timeAgo(post.created_at);
    headerRow.appendChild(time);
    container.appendChild(headerRow);

    // Generating/failed state — show placeholder
    if (post.status && post.status !== 'ready') {
      const cardRow = document.createElement('div');
      cardRow.className = 'detail-card-row';

      const card = document.createElement('div');
      card.className = 'detail-card';
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
      cardRow.appendChild(card);
      container.appendChild(cardRow);
      return;
    }

    // Card with image + star
    const cardRow = document.createElement('div');
    cardRow.className = 'detail-card-row';

    const card = document.createElement('div');
    card.className = 'detail-card';
    card.style.boxShadow = `0 0 30px ${post.color_hex}20, 0 0 60px ${post.color_hex}10`;

    // Image + waveform overlay wrapper
    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'detail-image-container';

    const img = document.createElement('img');
    img.className = 'detail-image';
    img.src = post.image_url;
    img.alt = 'Post image';
    imageWrapper.appendChild(img);

    const colorOverlay = document.createElement('div');
    colorOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0.15;';
    colorOverlay.style.background = post.color_hex;
    imageWrapper.appendChild(colorOverlay);

    // Init sync before creating any players
    const duration = post.structured_object?.duration_seconds || 10;
    audioPlayer.initSync(duration);

    const audioDiv = document.createElement('div');
    audioDiv.className = 'detail-audio';
    audioPlayer.createPlayer(post.audio_url, audioDiv, post.color_hex, {
      overlay: true, sync: true, id: `post-${postId}`,
    });
    imageWrapper.appendChild(audioDiv);

    card.appendChild(imageWrapper);
    cardRow.appendChild(card);

    // Star + count to the right
    const starCol = document.createElement('div');
    starCol.className = 'detail-star-col';
    starCol.innerHTML = `<span class="star-icon">\u2605</span><span class="star-count">${post.comments.length}</span>`;
    cardRow.appendChild(starCol);

    container.appendChild(cardRow);

    console.groupCollapsed(`[Post] ${postId}`);
    console.log('image_analysis:', post.image_analysis);
    console.log('squiggle_features:', post.squiggle_features);
    console.log('structured_object:', post.structured_object);
    console.log('compiled_prompt:', post.compiled_prompt);
    console.groupEnd();

    // Comments list
    const commentsList = document.createElement('div');
    commentsList.className = 'comments-list';

    for (const comment of post.comments) {
      commentsList.appendChild(createCommentItem(comment));
    }

    container.appendChild(commentsList);

    // Subscribe to comment status changes to replace shimmers with real players
    commentStatusHandler = (commentId, changedPostId, status) => {
      if (changedPostId !== postId) return;
      const shimmerEl = commentsList.querySelector(`[data-comment-id="${commentId}"]`);
      if (!shimmerEl) return;

      if (status === 'ready') {
        // Fetch updated comments and replace the shimmer
        api.getComments(postId).then(data => {
          const readyComment = data.comments.find(c => c.id === commentId);
          if (readyComment) {
            const newItem = createCommentItem(readyComment);
            shimmerEl.replaceWith(newItem);
          }
          starCol.querySelector('.star-count').textContent = data.comments.length;
        }).catch(() => {});
      } else if (status === 'failed') {
        // Update shimmer to show failed state
        const placeholder = shimmerEl.querySelector('.comment-shimmer-bar');
        if (placeholder) {
          placeholder.style.opacity = '0.5';
          const shimmerOverlay = placeholder.querySelector('.shimmer-overlay');
          if (shimmerOverlay) shimmerOverlay.remove();
          const label = placeholder.querySelector('.generating-label');
          if (label) label.textContent = 'failed';
        }
      }
    };
    onCommentStatusChange(commentStatusHandler);

    // Add-comment button at bottom right (admin only)
    if (isAdmin()) {
      const addRow = document.createElement('div');
      addRow.className = 'detail-add-row';
      const addBtn = document.createElement('button');
      addBtn.className = 'add-comment-btn';
      addBtn.textContent = '+ \u2605';
      addBtn.addEventListener('click', () => {
        openCreateOverlay(postId, (newCommentId, newStatus) => {
          if (newStatus === 'generating') {
            const shimmerComment = {
              id: newCommentId,
              username: '',
              audio_url: '',
              color_hex: post.color_hex,
              created_at: new Date().toISOString(),
              status: 'generating',
            };
            commentsList.appendChild(createCommentItem(shimmerComment));
            const count = commentsList.querySelectorAll('.comment-item').length;
            starCol.querySelector('.star-count').textContent = count;
          }
        });
      });
      addRow.appendChild(addBtn);
      container.appendChild(addRow);
    }
  } catch (e) {
    const errDiv = document.createElement('div');
    errDiv.className = 'error-msg';
    errDiv.textContent = e.message;
    container.innerHTML = '';
    container.appendChild(errDiv);
  }
}

function createCommentItem(comment) {
  const div = document.createElement('div');
  div.className = 'comment-item';
  div.dataset.commentId = comment.id;

  // Generating/failed — show shimmer placeholder instead of audio player
  if (comment.status && comment.status !== 'ready') {
    const bar = document.createElement('div');
    bar.className = 'comment-shimmer-bar';
    bar.style.background = comment.color_hex;

    if (comment.status === 'failed') {
      bar.style.opacity = '0.5';
      const label = document.createElement('span');
      label.className = 'generating-label';
      label.textContent = 'failed';
      bar.appendChild(label);
    } else {
      const shimmer = document.createElement('div');
      shimmer.className = 'shimmer-overlay';
      bar.appendChild(shimmer);
      const label = document.createElement('span');
      label.className = 'generating-label';
      label.textContent = 'generating...';
      bar.appendChild(label);
    }

    div.appendChild(bar);
    return div;
  }

  // Waveform first
  const audioDiv = document.createElement('div');
  audioDiv.className = 'comment-audio';
  audioPlayer.createPlayer(comment.audio_url, audioDiv, comment.color_hex, {
    sync: true, id: `comment-${comment.id}`,
  });
  div.appendChild(audioDiv);

  // Meta column: username + time
  const meta = document.createElement('div');
  meta.className = 'comment-meta';
  const username = document.createElement('a');
  username.className = 'username-link';
  username.textContent = `${comment.username}`;
  username.href = `#/profile/${comment.username}`;
  meta.appendChild(username);
  const time = document.createElement('span');
  time.className = 'time-ago';
  time.textContent = timeAgo(comment.created_at);
  meta.appendChild(time);
  div.appendChild(meta);

  console.groupCollapsed(`[Comment] ${comment.id}`);
  console.log('image_analysis:', comment.image_analysis);
  console.log('squiggle_features:', comment.squiggle_features);
  console.log('structured_object:', comment.structured_object);
  console.log('compiled_prompt:', comment.compiled_prompt);
  console.groupEnd();

  return div;
}
