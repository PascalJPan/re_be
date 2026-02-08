const routes = [];
let currentCleanup = null;

export function addRoute(pattern, handler) {
  // pattern like '/feed', '/post/:id', '/profile/:username'
  const paramNames = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  routes.push({ regex: new RegExp('^' + regexStr + '$'), paramNames, handler });
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function start() {
  window.addEventListener('hashchange', () => resolve());
  resolve();
}

function resolve() {
  const hash = window.location.hash.slice(1) || '/feed';
  for (const route of routes) {
    const match = hash.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      if (currentCleanup) {
        currentCleanup();
        currentCleanup = null;
      }
      const cleanup = route.handler(params);
      if (typeof cleanup === 'function') {
        currentCleanup = cleanup;
      }
      return;
    }
  }
  // Default to feed
  navigate('/feed');
}
