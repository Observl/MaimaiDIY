import test from 'node:test';
import assert from 'node:assert/strict';
import { captureProductImage, unmatteTransmission } from '../../src/transparent-capture.js';
import { DEFAULT_LIGHT_ANGLE } from '../../src/finish-settings.js';

test('glass unmatting preserves clear surroundings, opaque print and partial reflections', () => {
  const black = new Uint8ClampedArray([0,0,0,255, 80,130,210,255, 15,20,25,255]);
  const white = new Uint8ClampedArray([255,255,255,255, 80,130,210,255, 215,220,225,255]);
  const pixels = unmatteTransmission(black, white);
  assert.deepEqual([...pixels.slice(0,4)], [0,0,0,0]);
  assert.deepEqual([...pixels.slice(4,8)], [80,130,210,255]);
  assert.equal(pixels[11],55);
  for(let c=0;c<3;c++) {
    assert.ok(Math.abs(pixels[8+c]*pixels[11]/255-black[8+c])<1);
    assert.ok(Math.abs(pixels[8+c]*pixels[11]/255+255-pixels[11]-white[8+c])<1);
  }
});

test('bright reflected light and tinted glass remain bounded without losing opacity', () => {
  const black = new Uint8ClampedArray([150,120,100,255, 2,4,6,255]);
  const white = new Uint8ClampedArray([255,250,240,255, 240,250,255,255]);
  const pixels = unmatteTransmission(black,white);
  assert.equal(pixels[3],150);
  assert.equal(pixels[7],17);
  assert.ok(pixels[4]>0 && pixels[6]>pixels[4]);
  assert.deepEqual([...black],[150,120,100,255,2,4,6,255]);
});

test('unmatting rejects mismatched RGBA buffers', () => {
  assert.throws(()=>unmatteTransmission(new Uint8Array(4),new Uint8Array(8)),RangeError);
  assert.throws(()=>unmatteTransmission(new Uint8Array(3),new Uint8Array(3)),RangeError);
});


test('minor negative transmission noise cannot overflow alpha or dim opaque pixels', () => {
  assert.deepEqual([...unmatteTransmission(new Uint8ClampedArray([80,80,80,255]),new Uint8ClampedArray([79,79,79,255]))],[80,80,80,255]);
});

function captureFixture() {
  const color = { value: '#f3eee4', set(value) { this.value=value;return this; }, clone() { return {...this}; } };
  const scene={background:color,fog:{color:'fog'}};
  const camera={aspect:2,updateProjectionMatrix(){}};
  const floor={visible:true};
  let ratio=2,size={x:400,y:200},fail=false;
  const renderStates=[];
  const renderer={
    domElement:{width:800,height:400},capabilities:{maxTextureSize:4096},
    getContext:()=>({isContextLost:()=>false}),
    getSize:target=>target.set(size.x,size.y),getPixelRatio:()=>ratio,
    setPixelRatio(value){ratio=value;},
    setSize(x,y){size={x,y};this.domElement.width=x*ratio;this.domElement.height=y*ratio;},
    render(){renderStates.push([scene.background.value,floor.visible,scene.fog]);if(fail){fail=false;throw Error('capture failed');}},
  };
  const ctx={clearRect(){},drawImage(){},getImageData(){return {data:new Uint8ClampedArray([0,0,0,255])};},putImageData(){}};
  const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>ctx,toDataURL(){return this.width+'x'+this.height;}})};
  return {renderer,scene,camera,floor,backgroundColor:color,renderStates,oldBackground:scene.background,oldFog:scene.fog,
    failNext(){fail=true;},cleanup(){globalThis.document=oldDocument;}};
}

test('high-resolution capture restores viewport, aspect, studio background, floor and fog', () => {
  const f=captureFixture();
  try {
    assert.equal(captureProductImage({...f,width:1600,background:'#142538'}),'1600x800');
    assert.deepEqual(f.renderStates[0],['#142538',false,null]);
    assert.equal(f.scene.background,f.oldBackground);assert.equal(f.scene.fog,f.oldFog);assert.equal(f.floor.visible,true);
    assert.deepEqual([f.renderer.domElement.width,f.renderer.domElement.height],[800,400]);
    assert.equal(f.renderer.getPixelRatio(),2);assert.equal(f.camera.aspect,2);
  } finally {f.cleanup();}
});

test('failed captures restore the live scene and oversized exports are rejected', () => {
  const f=captureFixture();
  try {
    f.failNext();assert.throws(()=>captureProductImage({...f,width:1600,background:'#ffffff'}),/capture failed/);
    assert.equal(f.scene.background,f.oldBackground);assert.equal(f.scene.fog,f.oldFog);assert.equal(f.floor.visible,true);
    assert.equal(f.renderer.domElement.width,800);assert.equal(f.camera.aspect,2);
    assert.throws(()=>captureProductImage({...f,width:5000}),RangeError);
    assert.throws(()=>captureProductImage({...f,width:1.5}),RangeError);
  } finally {f.cleanup();}
});


test('default studio lighting illuminates the printed front face', () => {
  const radians = DEFAULT_LIGHT_ANGLE * Math.PI / 180;
  const windowZ = 8 * Math.sin(radians) + 6 * Math.cos(radians);
  assert.ok(windowZ > 6, 'do not put the finish light behind the print by default');
});
