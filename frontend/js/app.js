import * as router from './router.js';
import { getUser, setUser, setAdmin, isAdmin } from './auth.js';
import * as api from './api.js';
import * as feed from './feed.js';
import * as profile from './profile.js';
import * as postDetail from './post-detail.js';
import { openCreateOverlay } from './create-flow.js';
import { initWigglyBackground } from './wiggly-bg.js';

const app = document.getElementById('app');

// --- Username + passcode popup ---
function showUsernamePopup() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'username-popup-overlay';
    overlay.innerHTML = `
      <div class="username-popup">
        <h2>welcome</h2>
        <form class="username-popup-form">
          <input type="text" class="username-popup-input"
                 placeholder="your name" maxlength="24" autofocus />
          <input type="password" class="username-popup-input username-popup-passcode"
                 placeholder="passcode" inputmode="numeric" />
          <p class="username-popup-hint">admin? enter the passcode to create.<br/>otherwise just vibe.</p>
          <button type="submit" class="primary username-popup-btn">enter</button>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector('.username-popup-input:first-of-type');
    const codeInput = overlay.querySelector('.username-popup-passcode');
    const form = overlay.querySelector('.username-popup-form');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!name) return;
      setUser(name);

      const code = codeInput.value.trim();
      if (code) {
        try {
          const result = await api.verifyPasscode(code);
          setAdmin(result.admin);
        } catch {
          setAdmin(false);
        }
      } else {
        setAdmin(false);
      }

      overlay.remove();
      resolve();
    });

    requestAnimationFrame(() => nameInput.focus());
  });
}

// --- Navbar ---
function updateNav() {
  const nav = document.getElementById('navbar');
  const user = getUser();

  nav.innerHTML = `
    <a href="#/feed" class="nav-brand" aria-label="Home">
      <img class="nav-logo" src="logo.png" alt="re" />
    </a>
    <div class="nav-actions">
      ${isAdmin() ? '<button class="nav-create-btn" title="New post">+</button>' : ''}
      <a href="#/profile/${user.username}" class="nav-user">@${user.username}</a>
    </div>
  `;

  if (isAdmin()) {
    nav.querySelector('.nav-create-btn').addEventListener('click', () => {
      openCreateOverlay(null);
    });
  }
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
document.addEventListener('DOMContentLoaded', async () => {
  initWigglyBackground();

  if (!getUser()) {
    await showUsernamePopup();
  }

  updateNav();
  router.start();
});
