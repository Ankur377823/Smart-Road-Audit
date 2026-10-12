/**
 * Demo sign-in session. The app has no user accounts on the server yet, so this only gates the UI:
 * it keeps people on the sign-in page until they have signed in, it does not secure the API.
 */
const SESSION_KEY = 'smartroad.session'
// Fallback when storage is blocked (some private-browsing modes): lasts until the page reloads
let memorySession = false

export function isSignedIn() {
  try {
    return window.localStorage.getItem(SESSION_KEY) === '1' || memorySession
  } catch {
    return memorySession
  }
}

export function signIn() {
  memorySession = true
  try {
    window.localStorage.setItem(SESSION_KEY, '1')
  } catch {
    // Storage blocked: memorySession covers this page load
  }
}

export function signOut() {
  memorySession = false
  try {
    window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // Nothing stored
  }
}

/** Only allow same-app paths as post-login destinations (no external or protocol-relative URLs). */
export function safeNextPath(next, fallback = '/dashboard') {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : fallback
}

export function loginPath(next) {
  return `/login?next=${encodeURIComponent(next)}`
}
