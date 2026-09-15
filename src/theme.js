// Tiny dark-mode controller: 'light' | 'dark' | 'system', persisted, applied
// as data-theme on <html>. 'system' means no attribute — the CSS's
// prefers-color-scheme media query takes over.
const KEY = 'hsc-fund:theme';

export function getTheme() {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private browsing etc — theme just won't persist */
  }
  applyTheme(theme);
}

export function initTheme() {
  applyTheme(getTheme());
}

export function resolvedIsDark() {
  const t = getTheme();
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}
