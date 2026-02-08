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
    <a href="#/feed" class="nav-brand">re</a>
    <div class="nav-actions">
      <button class="nav-create-btn" title="New post">+</button>
      <a href="#/profile/${user.username}" class="nav-user">@${user.username}</a>
    </div>
  `;

  nav.querySelector('.nav-create-btn').addEventListener('click', () => {
    openCreateOverlay(null, () => {
      if (window.location.hash === '#/feed') {
        feed.render(app);
      } else {
        router.navigate('/feed');
      }
    });
  });
}

// --- Routes ---
router.addRoute('/feed', () => {
  feed.render(app);
});

router.addRoute('/post/:id', (params) => {
  return postDetail.render(app, params.id);
});

router.addRoute('/profile/:username', (params) => {
  profile.render(app, params.username);
});

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  initWigglyBackground();
  updateNav();
  router.start();
});
