import test from 'node:test';
import assert from 'node:assert/strict';
import { titleMasonryLayout } from '../../src/picker.js';

for (const width of [248, 318, 864]) {
  test(`title masonry fills columns without horizontal overflow at ${width}px`, () => {
    const heights = [52, 140, 65, 90, 220, 42, 80, 50, 150];
    const result = titleMasonryLayout(width, heights);
    result.positions.forEach((item, i) => {
      assert.ok(item.left >= 0 && item.left + result.itemWidth <= width + 0.01);
      if (i) assert.ok(item.top >= result.positions[i - 1].top);
      const previous = result.positions.slice(0, i).map((p, j) => ({ ...p, height: heights[j] }))
        .filter(p => p.left === item.left).at(-1);
      assert.equal(item.top, previous ? previous.top + previous.height + 8 : 0);
    });
    assert.equal(result.height, Math.max(...result.positions.map((p, i) => p.top + heights[i])));
  });
}
test('empty title list has no reserved blank height', () => {
  assert.equal(titleMasonryLayout(280, []).height, 0);
});
