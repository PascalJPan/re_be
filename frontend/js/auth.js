let _username = null;
let _admin = false;

export function getUser() {
  if (!_username) return null;
  return { id: null, username: _username };
}

export function setUser(username) {
  _username = username;
}

export function getToken() {
  return null;
}

export function isLoggedIn() {
  return !!_username;
}

export function setAdmin(val) {
  _admin = !!val;
}

export function isAdmin() {
  return _admin;
}
