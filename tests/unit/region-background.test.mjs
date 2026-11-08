import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRegionBackground } from '../../src/region-background.js';
test('region theme toggles webpage layers without any canvas or design access', () => {
 const circle={hidden:false},magical={hidden:true};
 const root={documentElement:{dataset:{}},querySelector(selector){ if(selector==='#circle-background')return circle;if(selector==='#magical-background')return magical;throw new Error('Unexpected canvas/design access'); }};
 applyRegionBackground('jp',root);assert.equal(circle.hidden,true);assert.equal(magical.hidden,false);assert.equal(root.documentElement.dataset.region,'jp');
 applyRegionBackground('cn',root);assert.equal(circle.hidden,false);assert.equal(magical.hidden,true);assert.equal(root.documentElement.dataset.region,'cn');
});
