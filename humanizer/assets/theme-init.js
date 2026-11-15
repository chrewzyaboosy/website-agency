// Runs before first paint (classic, render-blocking script) so a saved theme
// choice is applied without a flash. Kept tiny and dependency-free.
(function () {
  try {
    var t = window.localStorage.getItem('inkling:theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: fall back to prefers-color-scheme */ }
})();
