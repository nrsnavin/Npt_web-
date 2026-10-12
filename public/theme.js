// Runs before the first paint so a stored preference never flashes the other theme.
// No stored choice leaves the attribute off, letting the stylesheet follow the OS.
//
// A file rather than a script written into index.html, so the page can be served under a
// Content-Security-Policy that allows no inline script at all [docs/DEPLOY-AWS.md, nginx].
try {
  var saved = localStorage.getItem('npt.theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
} catch (e) {}
