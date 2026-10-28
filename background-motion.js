(() => {
  const button = document.querySelector('#background-motion');
  const storageKey = 'maimai-diy-background-motion';
  let enabled = true;
  try { enabled = localStorage.getItem(storageKey) !== 'paused'; } catch {}

  function update() {
    document.documentElement.dataset.backgroundMotion = enabled ? 'running' : 'paused';
    button.textContent = enabled ? '关闭动效' : '开启动效';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? '关闭背景动效' : '开启背景动效');
  }

  update();
  button.addEventListener('click', () => {
    enabled = !enabled;
    update();
    try { localStorage.setItem(storageKey, enabled ? 'running' : 'paused'); } catch {}
  });
})();
