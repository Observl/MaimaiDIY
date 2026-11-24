import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const css = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');
const components = await readFile(new URL('../../components.css', import.meta.url), 'utf8');
const motion = await readFile(new URL('../../ui-motion.css', import.meta.url), 'utf8');
test('editor UI stylesheets parse without CSS warnings', async () => {
  for (const source of [css,motion,components]) assert.deepEqual((await transform(source,{loader:'css'})).warnings,[]);
});
test('shared UI tokens cover field, button, panel and spacing variants', () => {
  for (const name of ['border','secondary','accent-text','focus-ring','radius-compact','radius-control','radius-panel','control-compact','control-regular','field-height','space-2','space-3','space-4','space-6']) assert.match(css,new RegExp('--'+name+':'));
});
test('store palette aliases the editor palette rather than a separate blue skin', () => {
  assert.match(css,/--store-blue:var\(--accent\)/);
  assert.match(css,/--store-ink:var\(--ink\)/);
  assert.doesNotMatch(css,/#0071e3|#0077ed/);
});
test('phone fields prevent focus zoom and preserve large touch targets', () => {
  assert.match(css,/font-size:16px; min-height:44px/);
  assert.match(css,/\.switch-wrap \{ min-height:44px; \}/);
});
test('visibility and dialog scroll contracts remain intact', () => {
  assert.match(css,/\[hidden\] \{\s*display: none !important/);
  assert.match(css,/html:has\(#asset-picker\[open\]\) \{ overflow:hidden/);
  assert.match(css,/#circle-background\[hidden\], #magical-background\[hidden\]/);
});
test('motion and focus handling apply to both editing surfaces', () => {
  for(const selector of ['.order-back','.preview-products button','.acrylic-variants button']) assert.ok(motion.includes(selector));
  assert.ok(motion.includes('prefers-reduced-motion'));
  assert.ok(motion.includes('var(--focus-ring)'));
});
