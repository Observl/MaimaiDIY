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
  // Reserve one full-width space, then eight fixed em-sized character cells.
  // This is layout padding, never a character inserted into the stored name.
  // Neither name length nor glyph metrics changes the font size or spacing.
  const cellWidth = availableWidth / 9;
  const leadingSpace = cellWidth;
  const glyphs = characters.map((text, index) => ({ text, x: (index + 1) * cellWidth }));
  return { glyphs, cellWidth, leadingSpace, width: characters.length * cellWidth };
}
