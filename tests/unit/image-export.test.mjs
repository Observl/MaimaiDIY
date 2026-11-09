import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createPngBlob, exportErrorMessage, initializeImageExport, isIosSafari } from '../../src/image-export.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const png = new Blob(['png'], { type: 'image/png' });
const ids = ['export', 'image-export-title', 'image-export-dialog', 'image-export-preview', 'image-export-status',
  'image-export-actions', 'image-export-share', 'image-export-download', 'image-export-close'];

async function fixture(run, options = {}) {
  const elements = new Map();
  const canvases = [], links = [], created = [], revoked = [], timers = [];
  function element() {
    return {
      handlers: {}, hidden: true, disabled: false, open: false, textContent: '',
      addEventListener(name, fn) { this.handlers[name] = fn; },
      removeAttribute(name) { delete this[name]; },
      showModal() { this.open = true; },
      close() { this.open = false; this.handlers.close?.(); },
      remove() { this.removed = true; },
      focus() { this.focused = true; },
    };
  }
  ids.forEach(id => elements.set(id, element()));
  elements.get('export').textContent = '导出高清 PNG';
  const document = {
    querySelector: selector => elements.get(selector.slice(1)),
    body: { append(link) { link.attached = true; } },
    createElement(type) {
      if (type === 'a') {
        const link = { ...element(), click() {
          assert.equal(this.attached, true);
          if (options.clickError) throw options.clickError;
          this.clicked = true;
        } };
        links.push(link);
        return link;
      }
      assert.equal(type, 'canvas');
      const context = { drawImage(...args) { this.drawn = args; } };
      const canvas = {
        context,
        getContext() { return options.noContext ? null : context; },
        toDataURL(type) {
          assert.equal(type, 'image/png');
          if (options.encodeError) throw options.encodeError;
          return 'data:image/png;base64,cG5n';
        },
        toBlob(callback, type) {
          assert.equal(type, 'image/png');
          if (options.encodeError) throw options.encodeError;
          if (options.deferred) this.callback = callback;
          else callback(Object.hasOwn(options, 'blob') ? options.blob : png);
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  const globals = {
    document,
    navigator: options.navigator || { canShare: () => true, share: async () => {} },
    window: { File },
    URL: { createObjectURL(blob) { created.push(blob); return `blob:test-${created.length}`; },
      revokeObjectURL(url) { revoked.push(url); } },
    setTimeout(fn, delay) { timers.push({ fn, delay }); },
  };
  const saved = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const renderCanvas = { frame: 'snapshot' };
  try {
    const api = initializeImageExport({ renderCanvas, width: 2160, height: 904,
      preferPreview: options.useDetection ? undefined : options.preferPreview ?? true, isReady: options.isReady });
    await run({ e: id => elements.get(id), click: id => elements.get(id).handlers.click(),
      canvases, links, created, revoked, timers, renderCanvas, api });
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const safariAgent = 'Version/18.0 Mobile/15E148 Safari/604.1';
const iphone = { userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) ${safariAgent}` };
const ipad = { userAgent: `Mozilla/5.0 (iPad; CPU OS 17_0) ${safariAgent}` };
const desktopIpad = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 };
const nonSafari = [{}, { userAgent: 'Android Chrome/130.0 Safari/537.36', maxTouchPoints: 5 },
  { ...desktopIpad, maxTouchPoints: 0 }, { platform: 'Win32', maxTouchPoints: 10 },
  ...['CriOS', 'FxiOS', 'EdgiOS', 'OPiOS', 'GSA', 'DuckDuckGo', 'MicroMessenger'].map(browser =>
    ({ ...iphone, userAgent: `${iphone.userAgent} ${browser}/123` })),
  { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Mobile/15E148' }];
test('recognizes only iOS/iPadOS Safari, including desktop-mode iPad; excludes other browsers and webviews', () => {
  for (const device of [iphone, ipad, desktopIpad]) assert.equal(isIosSafari(device), true);
  for (const device of nonSafari) assert.equal(isIosSafari(device), false);
});

test('only iOS Safari changes the main action to save to Photos; Android, desktop and other iOS browsers download synchronously', async () => {
  for (const device of [iphone, ipad, desktopIpad]) {
    await fixture(async ({ click, e, links }) => {
      assert.equal(e('export').textContent, '保存到相册');
      assert.equal(e('image-export-title').textContent, '保存到相册');
      await click('export');
      assert.equal(e('image-export-dialog').open, true);
      assert.equal(e('image-export-download').textContent, '保存到文件');
      assert.equal(links.length, 0);
    }, { useDetection: true, navigator: device });
  }
  for (const device of nonSafari) {
    await fixture(async ({ click, e, links, created }) => {
      assert.equal(e('export').textContent, '导出高清 PNG');
      const pending = click('export');
      assert.equal(links[0].clicked, true, 'download happens before yielding the click handler');
      assert.match(links[0].href, /^data:image\/png/);
      assert.equal(e('image-export-dialog').open, false);
      assert.equal(created.length, 0);
      await pending;
    }, { useDetection: true, navigator: device });
  }
});

test('creates a 2160 x 904 snapshot synchronously and frees the temporary bitmap after encoding', async () => {
  await fixture(async ({ canvases, renderCanvas }) => {
    const promise = createPngBlob(renderCanvas, 2160, 904);
    assert.equal(canvases[0].width, 2160);
    assert.equal(canvases[0].height, 904);
    assert.deepEqual(canvases[0].context.drawn, [renderCanvas, 0, 0, 2160, 904]);
    canvases[0].callback(png);
    assert.equal(await promise, png);
    assert.equal(canvases[0].width, 0);
    assert.equal(canvases[0].height, 0);
  }, { deferred: true });
});

test('preview keeps its URL, shares only on a new tap and calls share synchronously before yielding', async () => {
  let calls = 0, shared;
  await fixture(async ({ click, e, revoked, timers }) => {
    await click('export');
    assert.equal(calls, 0);
    assert.equal(e('image-export-preview').src, 'blob:test-1');
    assert.equal(e('image-export-preview').hidden, false);
    assert.equal(e('image-export-share').hidden, false);
    assert.equal(e('image-export-download').download.endsWith('.png'), true);
    const pending = click('image-export-share');
    assert.equal(calls, 1);
    assert.equal(shared.files[0].type, 'image/png');
    assert.match(shared.files[0].name, /^maimai-diy-2160x904-\d+\.png$/);
    assert.equal(revoked.length, 0);
    await pending;
    assert.doesNotMatch(e('image-export-status').textContent, /已保存/);
    click('image-export-close');
    assert.equal(e('image-export-preview').src, undefined);
    assert.equal(e('image-export-download').href, undefined);
    assert.equal(e('export').disabled, false);
    assert.equal(revoked.length, 0);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 60_000);
    timers[0].fn();
    assert.deepEqual(revoked, ['blob:test-1']);
  }, { navigator: { canShare: ({ files }) => files[0] instanceof File,
    share(data) { calls++; shared = data; return Promise.resolve(); } } });
});

for (const [label, navigator] of [
  ['missing', {}], ['unsupported', { share() {}, canShare: () => false }],
  ['throws', { share() {}, canShare() { throw new Error('not supported'); } }],
]) test(`file sharing ${label}: keeps real image and explicit download without a share button`, async () => {
  await fixture(async ({ click, e }) => {
    await click('export');
    assert.equal(e('image-export-share').hidden, true);
    assert.equal(e('image-export-preview').hidden, false);
    assert.equal(e('image-export-download').href, 'blob:test-1');
    assert.match(e('image-export-status').textContent, /长按/);
    assert.doesNotMatch(e('image-export-status').textContent, /保存 \/ 分享/);
  }, { navigator });
});

for (const name of ['AbortError', 'NotAllowedError']) test(`${name} retains preview without triggering a fallback download`, async () => {
  let calls = 0;
  await fixture(async ({ click, e, links, revoked }) => {
    await click('export');
    await click('image-export-share');
    assert.match(e('image-export-status').textContent, name === 'AbortError' ? /已取消/ : /暂不可用/);
    assert.equal(e('image-export-dialog').open, true);
    assert.equal(e('image-export-share').disabled, false);
    assert.equal(e('image-export-preview').src, 'blob:test-1');
    assert.equal(links.length, 0);
    assert.equal(revoked.length, 0);
    await click('image-export-share');
    assert.equal(calls, 2);
  }, { navigator: { canShare: () => true, share() { calls++; return Promise.reject({ name }); } } });
});

test('pending encoding ignores repeated clicks, and closing invalidates an older result after reopening', async () => {
  await fixture(async ({ click, canvases, e, created }) => {
    const first = click('export');
    await click('export');
    assert.equal(canvases.length, 1);
    assert.equal(e('export').disabled, true);
    click('image-export-close');
    const second = click('export');
    canvases[1].callback(png);
    await second;
    canvases[0].callback(png);
    await first;
    assert.equal(created.length, 1);
    assert.equal(e('image-export-preview').src, 'blob:test-1');
    assert.equal(e('image-export-dialog').open, true);
  }, { deferred: true });
});

test('Escape during encoding closes without reopening or leaking URLs on late completion', async () => {
  await fixture(async ({ click, canvases, e, created }) => {
    const pending = click('export');
    let prevented = false;
    e('image-export-dialog').handlers.cancel({ preventDefault() { prevented = true; } });
    canvases[0].callback(png);
    await pending;
    assert.equal(prevented, true);
    assert.equal(e('image-export-dialog').open, false);
    assert.equal(e('export').disabled, false);
    assert.equal(created.length, 0);
  }, { deferred: true });
});

test('pending share deduplicates taps and cannot overwrite a newer export after close/reopen', async () => {
  const gate = deferred();
  let calls = 0;
  await fixture(async ({ click, e }) => {
    await click('export');
    const first = click('image-export-share');
    await click('image-export-share');
    assert.equal(calls, 1);
    click('image-export-close');
    await click('export');
    assert.equal(e('image-export-share').disabled, true);
    const status = e('image-export-status').textContent;
    gate.reject({ name: 'AbortError' });
    await first;
    assert.equal(e('image-export-status').textContent, status);
    assert.equal(e('image-export-share').disabled, false);
    assert.equal(e('image-export-preview').src, 'blob:test-2');
  }, { navigator: { canShare: () => true, share() { calls++; return gate.promise; } } });
});

for (const [label, options, pattern] of [
  ['null blob', { blob: null }, /图片生成失败/],
  ['empty blob', { blob: new Blob([], { type: 'image/png' }) }, /图片生成失败/],
  ['no canvas context', { noContext: true }, /图片生成失败/],
  ['security error', { encodeError: { name: 'SecurityError' } }, /跨域/],
  ['other error', { encodeError: new Error('memory') }, /图片生成失败/],
]) test(`${label} gives an accurate recoverable error and releases bitmap`, async () => {
  await fixture(async ({ click, e, canvases, created }) => {
    await click('export');
    assert.match(e('image-export-status').textContent, pattern);
    assert.equal(e('image-export-dialog').open, true);
    assert.equal(e('image-export-actions').hidden, true);
    assert.equal(canvases[0].width, 0);
    assert.equal(created.length, 0);
    click('image-export-close');
    assert.equal(e('export').disabled, false);
  }, options);
});

test('desktop keeps a synchronous attached-anchor data URL download without a preview or Blob URL', async () => {
  await fixture(async ({ click, e, links, timers, revoked }) => {
    await click('export');
    assert.equal(links.length, 1);
    assert.equal(links[0].clicked, true);
    assert.equal(links[0].removed, true);
    assert.equal(e('image-export-dialog').open, false);
    assert.equal(e('export').disabled, false);
    assert.equal(timers.length, 0);
    assert.equal(revoked.length, 0);
  }, { preferPreview: false });
});

test('desktop download exception shows a recoverable error instead of claiming success', async () => {
  await fixture(async ({ click, e }) => {
    await click('export');
    assert.equal(e('image-export-dialog').open, true);
    assert.equal(e('image-export-preview').hidden, true);
    assert.match(e('image-export-status').textContent, /图片生成失败/);
  }, { preferPreview: false, clickError: new Error('download failed') });
});

test('render-in-progress guard prevents exporting old/empty frames and survives modal close', async () => {
  let ready = false;
  await fixture(async ({ api, e, click, canvases }) => {
    assert.equal(e('export').disabled, true);
    await click('export');
    assert.equal(canvases.length, 0);
    ready = true;
    api.updateAvailability();
    await click('export');
    ready = false;
    click('image-export-close');
    assert.equal(e('export').disabled, true);
    ready = true;
    api.updateAvailability();
    assert.equal(e('export').disabled, false);
  }, { isReady: () => ready });
  assert.doesNotMatch(exportErrorMessage(new Error('anything')), /跨域/);
});
