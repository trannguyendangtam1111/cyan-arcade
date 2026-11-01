// Sets the light or dark theme before the page is first painted, so it never flashes in the other
// one. The same rule as src/lib/theme.ts: the player's stored choice, else the system's preference.
// A file of its own (not an inline script) because the site's Content-Security-Policy allows
// scripts from this site only.
;(function () {
  var theme = 'light'
  try {
    var stored = window.localStorage.getItem('cyan-arcade:theme')
    if (stored === 'light' || stored === 'dark') theme = stored
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark'
  } catch (error) {
    // Storage unavailable: the system's preference, or light.
  }
  document.documentElement.setAttribute('data-theme', theme)
})()
