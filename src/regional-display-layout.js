export function validateRegionalDisplayLayout(layout, region) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout))
    throw new Error(`Invalid regional display layout: ${region}`);

  const required = ['song-overlay', 'dot', 'percent', 'sd', 'dx'];
  for (let slot = 0; slot < 5; slot++) {
    required.push(`base-${slot}`, `level-label-${slot}`);
    if (region === 'cn') required.push(`cover-${slot}`);
    for (let digit = 0; digit <= 10; digit++) required.push(`level-${slot}-${digit}`);
  }
  if (region === 'jp') required.push('cover', 'cover-4');
  for (let digit = 0; digit < 10; digit++)
    required.push(`digit-${digit}`);

  for (const name of required) {
    const rect = Object.hasOwn(layout, name) ? layout[name] : null;
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isSafeInteger))
      throw new Error(`Missing or invalid regional display layer: ${region}/${name}`);
    const [x, y, width, height] = rect;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1080 || y + height > 452)
      throw new Error(`Regional display layer out of bounds: ${region}/${name}`);
  }
  return required;
}
