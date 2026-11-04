import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { COLLECTIBLE_MASK_FILES } from '../../src/collectible-mask-files.js';
test('each special asset has its own checked-in UV and glitter mask pair',async()=>{
  const paths=new Set(),uvHashes=new Set();
  assert.equal(Object.keys(COLLECTIBLE_MASK_FILES).length,125);
  for(const [key,item] of Object.entries(COLLECTIBLE_MASK_FILES)) {
    assert.match(item.sourceSHA256,/^[a-f0-9]{64}$/);
    for(const kind of ['uv','glitter']) {
      assert.ok(!paths.has(item[kind]),'shared file: '+key);paths.add(item[kind]);
      const file=await readFile(new URL('../../'+item[kind],import.meta.url),'utf8');
      const content=Buffer.from(file.match(/data:image\/png;base64,([^"\s]+)/)[1],'base64');
      assert.equal(content.subarray(1,4).toString(),'PNG');
      assert.equal(content.readUInt32BE(16),item.width);
      assert.equal(content.readUInt32BE(20),item.height);
      assert.equal(content[25],3,'indexed black-white image');
      if(kind==='uv') {assert.ok(content.length>80);uvHashes.add(createHash('sha256').update(content).digest('hex'));}
    }
  }
  assert.equal(paths.size,250);
  assert.ok(uvHashes.size>110,'most contours must differ, rather than copies of a shared template');
});
