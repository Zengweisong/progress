(() => {
  const key = 'shixu.appearance.v1';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  const valid = value => value === 'dark' || value === 'light';
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; }
  catch { /* Use the system appearance when storage is unavailable. */ }

  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171d1b' : '#fcfcf7');
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      const label = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  }
  apply();
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); }
    catch { /* Keep the selected appearance for this session. */ }
    apply();
  });
  system.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : null;
    apply();
  });
})();
