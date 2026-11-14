import test from 'node:test';
import assert from 'node:assert/strict';

test('Japanese titles prefer COS and retain local fallback', async () => {
 const original = globalThis.fetch;
 try {
  for (const available of [true, false]) {
   const calls = [];
   globalThis.fetch = async url => {
    calls.push(String(url));
    if (calls.length === 1 && !available) return { ok: false };
    return { ok: true, json: async () => ({region:'jp', items:[{id:'test',name:'Test Title',color:'Gold'}]}) };
   };
   const { regionCategory } = await import(`../../src/region-catalog.js?cos-test=${available}`);
   const result = await regionCategory('jp', { category:'titles', label:'称号' });
   assert.match(calls[0], /\/materials\/regions\/jp-titles.json$/);
   assert.equal(calls.length, available ? 1 : 2);
   if (!available) assert.match(calls[1], /\/data\/regions\/jp-titles.json$/);
   assert(result.items.some(item => item.name === 'Test Title'));
  }
 } finally { globalThis.fetch = original; }
});
