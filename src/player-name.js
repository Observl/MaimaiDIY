// Count and render the same visible characters, including combining marks and emoji.
export function nameCharacters(value) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(value)]
      .map(({ segment }) => segment);
  }
  return [...value];
}

export function layoutPlayerName(value, availableWidth, measureText) {
  // Convert only English letters for display. Stored names, digits, punctuation,
  // CJK characters and emoji retain their original text.
  const characters = nameCharacters(value.replace(/[A-Za-z]/g,
    (letter) => String.fromCharCode(letter.charCodeAt(0) + 0xfee0)));
  const cellWidth = availableWidth / Math.max(6, characters.length);
  const fullWidth = measureText('あ').width;
  const scaleX = cellWidth / fullWidth;
  const glyphs = characters.map((text, index) => {
    const metrics = measureText(text);
    // Include ink overhangs, not just advance widths. A fallback font or a
    // joined emoji may be wider than one em, but must still fit its own cell.
    const left = Math.min(0, -(metrics.actualBoundingBoxLeft ?? 0));
    const right = Math.max(metrics.width, metrics.actualBoundingBoxRight ?? metrics.width);
    const width = right - left;
    const fit = width > fullWidth ? fullWidth / width : 1;
    return {
      text,
      x: index * cellWidth + (fullWidth - width * fit) * scaleX / 2 - left * fit * scaleX,
      scaleX: scaleX * fit,
    };
  });
  return { glyphs, cellWidth, width: characters.length * cellWidth };
}
