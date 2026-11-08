// Website decoration only: never reads or changes composition files, masks, or canvas.
export function applyRegionBackground(region, documentRoot = document) {
  const japanese = region === 'jp';
  documentRoot.querySelector('#circle-background').hidden = japanese;
  documentRoot.querySelector('#magical-background').hidden = !japanese;
  documentRoot.documentElement.dataset.region = japanese ? 'jp' : 'cn';
}
