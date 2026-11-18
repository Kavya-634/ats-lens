// Runs before first paint to avoid a light/dark flash. Kept outside the
// bundle and inline-free so the Content-Security-Policy can forbid inline scripts.
;(function () {
  try {
    var t = localStorage.getItem('ats-lens-theme')
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t
  } catch (e) {
    /* storage unavailable */
  }
})()
