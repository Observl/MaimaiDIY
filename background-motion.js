(() => {
  const button = document.querySelector('#background-motion');
  const storageKey = 'maimai-diy-background-motion';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let preference;
  let enabled;
  try {
    preference = localStorage.getItem(storageKey);
  } catch {}

  function update() {
    enabled = preference === 'running' || (preference !== 'paused' && !reducedMotion.matches);
    document.documentElement.dataset.backgroundMotion = enabled ? 'running' : 'paused';
    button.textContent = enabled ? '关闭动效' : '开启动效';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? '关闭背景动效' : '开启背景动效');
  }

  update();
  reducedMotion.addEventListener('change', update);
  button.addEventListener('click', () => {
    preference = enabled ? 'paused' : 'running';
    update();
    try {
      localStorage.setItem(storageKey, preference);
    } catch {}
  });
})();
