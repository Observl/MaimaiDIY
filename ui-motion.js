document.addEventListener(
  'pointerdown',
  () => {
    document.documentElement.dataset.inputMethod = 'pointer';
  },
  { passive: true }
);
document.addEventListener('keydown', () => {
  document.documentElement.dataset.inputMethod = 'keyboard';
});
