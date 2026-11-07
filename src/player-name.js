// Count and render the same visible characters, including combining marks and emoji.
export function nameCharacters(value) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(value)]
      .map(({ segment }) => segment);
  }
  return [...value];
}

export function layoutPlayerName(value, availableWidth) {
  // Convert only English letters for display. Stored names, digits, punctuation,
  // CJK characters and emoji retain their original text.
  const characters = nameCharacters(value.replace(/[A-Za-z]/g,
    (letter) => String.fromCharCode(letter.charCodeAt(0) + 0xfee0)));
  // Eight fixed em-sized cells. Neither name length nor glyph metrics changes
  // the font size or spacing; narrow glyphs stay centered in their own cell.
  const cellWidth = availableWidth / 8;
  const glyphs = characters.map((text, index) => ({ text, x: index * cellWidth }));
  return { glyphs, cellWidth, width: characters.length * cellWidth };
}
