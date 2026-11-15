import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesignHistory } from '../../src/design-history.js';

test('design histories isolate regions, coalesce input, and clear redo on a new edit', async () => {
  const values = { cn: 0, jp: 10 };
  let region = 'cn';
  const history = createDesignHistory({
    currentRegion: () => region,
    snapshot: key => values[key],
    restore: value => { values[region] = value; },
    onChange() {},
    limit: 2,
  });
  history.recordHistory('rating');
  values.cn = 1;
  history.recordHistory('rating');
  values.cn = 2;
  history.clearTransaction();
  region = 'jp';
  history.recordHistory();
  values.jp = 11;
  region = 'cn';
  await history.undo();
  assert.deepEqual(values, { cn: 0, jp: 11 });
  await history.redo();
  assert.deepEqual(values, { cn: 2, jp: 11 });
  history.recordHistory();
  values.cn = 3;
  history.recordHistory();
  values.cn = 4;
  await history.undo();
  await history.undo();
  await history.undo();
  assert.equal(values.cn, 2);
  history.recordHistory();
  values.cn = 7;
  await history.redo();
  assert.equal(values.cn, 7);
  region = 'jp';
  await history.undo();
  assert.deepEqual(values, { cn: 7, jp: 10 });
});
