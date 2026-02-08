import * as api from './api.js';
import * as audioPlayer from './audio-player.js';
import { navigate } from './router.js';
import { timeAgo, toast } from './ui.js';
import { openCreateOverlay } from './create-flow.js';

export function render(container, postId) {
  container.innerHTML = '<div class="feed-loading">Loading...</div>';
  loadPost(container, postId);
  return () => audioPlayer.clearPlayers();
}

async function loadPost(container, postId) {
  try {
    const post = await api.getPost(postId);
    container.innerHTML = '';

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

    // Add-comment button at bottom right
    const addRow = document.createElement('div');
    addRow.className = 'detail-add-row';
    const addBtn = document.createElement('button');
    addBtn.className = 'add-comment-btn';
    addBtn.textContent = '+ \u2605';
    addBtn.addEventListener('click', () => {
      openCreateOverlay(postId, (newCommentId) => {
        api.getComments(postId).then(data => {
          const newComment = data.comments.find(c => c.id === newCommentId);
          if (newComment) {
            commentsList.appendChild(createCommentItem(newComment));
            starCol.querySelector('.star-count').textContent = data.comments.length;
          }
        }).catch(() => loadPost(container, postId));
      });
    });
    addRow.appendChild(addBtn);
    container.appendChild(addRow);
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
