import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mergeDxSongTitles, loadDxTitleCategory } from '../../src/dx-song-titles.js';

const dx = name => ({ id: `1:dx`, name });
test('exact DX names get Gold once, preserving special colour and WIREPULLER', () => {
 const base = [{id:'old',name:'曲 A',color:'Gold'}, {id:'special',name:'曲 A',color:'Rainbow'},
  {id:'wire',name:'WIREPULLER',color:'Rainbow'}, {id:'other',name:'特殊',color:'Silver'}];
 const original = JSON.stringify(base);
 const result = mergeDxSongTitles(base,[dx('曲 A'),dx('曲 A'),{id:'2:sd',name:'标准'},dx('曲 a')],'jp');
 assert.equal(result.filter(i=>i.name==='曲 A'&&i.color==='Gold').length,1);
 assert(result.some(i=>i.id==='special'));
 assert(result.some(i=>i.id==='wire'));
 assert(!result.some(i=>i.name==='标准'));
 assert(result.some(i=>i.name==='曲 a'));
 assert.equal(JSON.stringify(base),original);
 assert.equal(new Set(result.map(i=>i.id)).size,result.length);
});
test('regional isolation, stable identifiers, and changed songs regenerate the view', () => {
 const cn=mergeDxSongTitles([], [dx('国服')], 'cn');
 const jp=mergeDxSongTitles([{region:'cn',name:'国服',color:'Silver'}],[dx('日服')],'jp');
 assert.deepEqual(jp.map(i=>i.name),['日服']);
 assert.equal(cn[0].id,mergeDxSongTitles([], [dx('国服'),dx('新歌')],'cn')[0].id);
 assert.equal(mergeDxSongTitles([], [dx('新歌')],'cn').some(i=>i.name==='国服'),false);
 assert.throws(()=>mergeDxSongTitles([],[],'other'));
});
test('both asynchronous sources finish before title view resolves, and failures allow retry', async()=>{
 let resolveSongs;
 const loadSongs=()=>new Promise(resolve=>{resolveSongs=resolve;});
 let finished=false;
 const pending=loadDxTitleCategory('cn','称号',{loadBase:async()=>[],loadSongs}).then(v=>{finished=true;return v;});
 await Promise.resolve(); assert.equal(finished,false);
 resolveSongs({region:'cn',items:[dx('曲')]});
 assert.equal((await pending).items[0].color,'Gold');
 await assert.rejects(loadDxTitleCategory('cn','称号',{loadBase:async()=>[],loadSongs:async()=>{throw Error('offline');}}));
 await assert.rejects(loadDxTitleCategory('cn','称号',{loadBase:async()=>[],loadSongs:async()=>({region:'jp',items:[]})}));
 assert.equal((await loadDxTitleCategory('cn','称号',{loadBase:async()=>[],loadSongs:async()=>({region:'cn',items:[]})})).items.length,0);
});
test('picker keeps selected title matching by text and colour, and refreshes title searches',async()=>{
 const picker=await readFile(new URL('../../src/picker.js',import.meta.url),'utf8');
 assert.match(picker,/item\.name === state\.titleName && \(item\.color \|\| 'Normal'\) === state\.titleColor/);
 assert.match(picker,/cachedView && control\.category !== 'titles'/);
 assert.match(picker,/applyPickerFilters\(true\)/);
});

test('unrelated special titles are preserved even when their labels match', () => {
 const base = [{id:'one', name:'Special', color:'Silver'}, {id:'two', name:'Special', color:'Silver'}];
 assert.deepEqual(mergeDxSongTitles(base, [], 'jp'), base);
});
