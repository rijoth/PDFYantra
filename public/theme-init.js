/* Theme bootstrap — runs synchronously in <head> so the first paint already
   uses the correct palette (no flash of the wrong theme).
   External file on purpose: a strict `script-src 'self'` blocks inline scripts. */
(function () {
  if (
    localStorage.theme === 'dark' ||
    (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();
