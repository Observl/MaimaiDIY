// Shared title metrics: keep natural glyph proportions in every preview.
export const TITLE_FONT_SIZE = 13.33333;
export const TITLE_SPACING = 0.2666666;
export const TITLE_STATIC_NOTICE = '称号超出框宽，网页预览会滚动播放；静态图片只保留当前一帧，无法完整展示称号。';
export function titleTextWidth(text, measure) {
  const chars = [...String(text || '')];
  return chars.reduce((width, char) => width + measure(char), 0) + Math.max(0, chars.length - 1) * TITLE_SPACING;
}
export function titleScrollOffset(width, available, elapsed) {
  const distance = Math.max(0, width - available);
  if (!distance) return 0;
  // Pause on both ends; rewind only after the complete title has been shown.
  const hold = 1400;
  const travel = distance / 24 * 1000;
  const time = Math.max(0, elapsed) % (hold * 2 + travel);
  return time <= hold ? 0 : Math.min(distance, (time - hold) / 1000 * 24);
}
