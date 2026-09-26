/* Applies the stored theme (or the OS preference) before first paint to avoid a flash.
   Kept in a local file so the Content Security Policy can forbid inline scripts. */
(function () {
  var t = null;
  try { t = localStorage.getItem('etp-theme'); } catch (e) { /* storage unavailable */ }
  if (t !== 'light' && t !== 'dark') {
    t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
})();
