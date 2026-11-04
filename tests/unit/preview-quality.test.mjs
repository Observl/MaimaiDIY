import test from 'node:test';
import assert from 'node:assert/strict';
import {previewQuality} from '../../src/preview-quality.js';

test('unknown and mobile GPUs use bounded defaults without trusting a fallback tier',()=>{
  assert.equal(previewQuality({tier:3,type:'FALLBACK',isMobile:true}).pixelRatio,1);
  assert.equal(previewQuality({tier:3,type:'BENCHMARK_FETCH_FAILED'}).pixelRatio,1.5);
  assert.equal(previewQuality({tier:0,type:'BLOCKLISTED',isMobile:true}).shadowSize,1024);
  assert.equal(previewQuality({tier:0,type:'BLOCKLISTED'}).pixelRatio,1);
});

test('known GPU tiers scale transmission cost and snapshot quality remains deterministic',()=>{
  const low=previewQuality({tier:1,type:'BENCHMARK'});
  const high=previewQuality({tier:3,type:'BENCHMARK'});
  assert.ok(high.samples>low.samples);
  assert.ok(high.shadowSize>low.shadowSize);
  assert.deepEqual(previewQuality({tier:3,type:'BENCHMARK'},true),previewQuality({tier:0,type:'BLOCKLISTED'},true));
});
