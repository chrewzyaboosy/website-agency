/* Sets the colour theme before first paint (no flash of the wrong theme).
   Loaded synchronously in <head>. The toggle button is added by script.js. */
(function () {
  try {
    var t = localStorage.getItem("msw-theme");
    if (t !== "dark" && t !== "light") {
      t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* localStorage blocked — stay on default light */ }
})();
