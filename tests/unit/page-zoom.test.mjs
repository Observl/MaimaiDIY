import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../../background-motion.js', import.meta.url), 'utf8');
function setup({ scale = 1, preference = null, viewportAvailable = true } = {}) {
  const viewportEvents = {};
  const windowEvents = {};
  const attributes = new Set();
  const root = { dataset: {}, toggleAttribute(name, enabled) { enabled ? attributes.add(name) : attributes.delete(name); } };
  const viewport = { scale, addEventListener(name, callback) { viewportEvents[name] = callback; } };
  const writes = [];
  const storage = { getItem: () => preference, setItem: (...args) => writes.push(args) };
  runInNewContext(script, {
    window: { visualViewport: viewportAvailable ? viewport : undefined, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener(name, callback) { windowEvents[name] = callback; } },
    document: { documentElement: root, querySelector: () => null },
    localStorage: storage,
  });
  return { root, attributes, viewport, viewportEvents, windowEvents, writes };
}

test('pinch pauses decoration via a temporary flag, without changing the preference', () => {
  const page = setup();
  assert.equal(page.attributes.has('data-page-zoomed'), false);
  page.viewport.scale = 2;
  page.viewportEvents.resize();
  assert.equal(page.attributes.has('data-page-zoomed'), true);
  assert.equal(page.root.dataset.backgroundMotion, 'running');
  page.viewport.scale = 1;
  page.viewportEvents.resize();
  assert.equal(page.attributes.has('data-page-zoomed'), false);
  assert.deepEqual(page.writes, []);
});

test('initial zoom, restored pages and disabled motion are respected', () => {
  const page = setup({ scale: 2, preference: 'paused' });
  assert.equal(page.attributes.has('data-page-zoomed'), true);
  page.viewport.scale = 1;
  page.windowEvents.pageshow();
  assert.equal(page.attributes.has('data-page-zoomed'), false);
  assert.equal(page.root.dataset.backgroundMotion, 'paused');
});

test('missing VisualViewport and nonfinite scale are safe', () => {
  assert.equal(setup({ viewportAvailable: false }).attributes.size, 0);
  assert.equal(setup({ scale: NaN }).attributes.size, 0);
});

test('touch surfaces avoid backdrop buffers and page zoom remains enabled', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(css, /@media \(any-pointer: coarse\)[\s\S]*?-webkit-backdrop-filter: none;[\s\S]*?backdrop-filter: none;/);
  assert.match(css, /html\[data-page-zoomed\][\s\S]*?animation-play-state: paused !important;/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/);
});
