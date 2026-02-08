import * as router from './router.js';
import { getUser } from './auth.js';
import * as feed from './feed.js';
import * as profile from './profile.js';
import * as postDetail from './post-detail.js';
import { openCreateOverlay } from './create-flow.js';
import { initWigglyBackground } from './wiggly-bg.js';

const app = document.getElementById('app');

// --- Navbar ---
function updateNav() {
  const nav = document.getElementById('navbar');
  const user = getUser();

  nav.innerHTML = `
    <a href="#/feed" class="nav-brand" aria-label="Home">
      <svg class="nav-logo" viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M 16 4 C 9.4 4 4 9.4 4 16 C 4 22.6 9.4 28 16 28 C 22.6 28 28 22.6 28 16 C 28 12.2 26.2 8.8 23.4 6.6" style="stroke-dasharray: none;">
          <animate attributeName="d" dur="3s" repeatCount="indefinite" values="
            M 16 4 C 9.4 4 4 9.4 4 16 C 4 22.6 9.4 28 16 28 C 22.6 28 28 22.6 28 16 C 28 12.2 26.2 8.8 23.4 6.6;
            M 16 3.5 C 8.8 4.5 3.5 9.8 4.2 16.3 C 4.8 22.8 9.8 28.2 16.3 27.8 C 22.8 27.2 28.2 22.2 27.8 15.7 C 27.5 11.9 25.8 8.6 23 6.2;
            M 16 4.5 C 10 3.5 4.5 10 3.8 15.7 C 3.2 22.4 9 28.5 15.7 28.2 C 22.4 28.8 28.5 23 28.2 16.3 C 28.5 12.5 26.5 9 23.8 7;
            M 16 4 C 9.4 4 4 9.4 4 16 C 4 22.6 9.4 28 16 28 C 22.6 28 28 22.6 28 16 C 28 12.2 26.2 8.8 23.4 6.6
          " />
        </path>
        <polyline points="23.4 2.5 23.4 6.6 19.2 6.6">
          <animate attributeName="points" dur="3s" repeatCount="indefinite" values="
            23.4 2.5 23.4 6.6 19.2 6.6;
            23 2.2 23 6.2 18.8 6.2;
            23.8 2.8 23.8 7 19.5 7;
            23.4 2.5 23.4 6.6 19.2 6.6
          " />
        </polyline>
      </svg>
    </a>
    <div class="nav-actions">
      <button class="nav-create-btn" title="New post">+</button>
      <a href="#/profile/${user.username}" class="nav-user">@${user.username}</a>
    </div>
  `;

  nav.querySelector('.nav-create-btn').addEventListener('click', () => {
    openCreateOverlay(null);
  });
}

// --- Routes ---
router.addRoute('/feed', () => {
  return feed.render(app);
});

router.addRoute('/post/:id', (params) => {
  return postDetail.render(app, params.id);
});

router.addRoute('/profile/:username', (params) => {
  return profile.render(app, params.username);
});

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initWigglyBackground();
  updateNav();
  router.start();
});
