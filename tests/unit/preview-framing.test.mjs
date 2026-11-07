import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, PerspectiveCamera, Mesh, PlaneGeometry } from 'three';
import { nameplateRegion, fitPerspectiveDistance } from '../../src/preview-framing.js';

const direction = new Vector3(6, 2.75, 12.5).normalize();
const nearDistance = Math.hypot(6, 2.75, 12.5);

test('nameplate focus uses the artwork rectangle on the actual print plane', () => {
  const region = nameplateRegion(11.91, 4.91);
  assert.ok(Math.abs(region.center[0] - -1.648652777777778) < 1e-9);
  assert.ok(Math.abs(region.center[1] - 1.5425221238938054) < 1e-9);
  assert.ok(Math.abs(region.corners[1][0] - region.corners[0][0] - 7.906916666666667) < 1e-9);
});

for (const [product, y, z] of [['acrylic', 2.5, -0.746], ['stand', 2.75, -0.746], ['card', 2.5, 0.0215], ['shikishi', 2.5, 0.064]]) {
  for (const [screen, width, height, fov] of [['desktop', 960, 440, 34], ['mobile', 326, 300, 48], ['narrow', 256, 300, 48]]) {
    test(`${product} nameplate stays centered and fully framed on ${screen}`, () => {
      const art = new Mesh(new PlaneGeometry(11.91, 4.91));
      art.position.set(0, y, z);
      const region = nameplateRegion(art.geometry.parameters.width, art.geometry.parameters.height);
      const center = art.localToWorld(new Vector3(...region.center));
      const corners = region.corners.map(point => art.localToWorld(new Vector3(...point)));
      const distance = Math.max(3, fitPerspectiveDistance(corners.map(point => point.clone().sub(center).toArray()), direction.toArray(), fov, width / height));
      const camera = new PerspectiveCamera(fov, width / height, 0.1, 120);
      camera.position.copy(center).addScaledVector(direction, distance);
      camera.lookAt(center); camera.updateMatrixWorld();
      const projectedCenter = center.clone().project(camera);
      assert.ok(Math.abs(projectedCenter.x) < 1e-9 && Math.abs(projectedCenter.y) < 1e-9);
      assert.ok(Math.abs(center.y - y - region.center[1]) < 1e-9);
      assert.equal(center.z, z);
      assert.ok(distance < nearDistance * (width < 500 ? 1.45 : 1), 'closer than the existing near view');
      for (const corner of corners) {
        const projected = corner.project(camera);
        assert.ok(Math.abs(projected.x) <= 1 / 1.16 + 1e-9);
        assert.ok(Math.abs(projected.y) <= 1 / 1.16 + 1e-9);
        assert.ok(projected.z > -1 && projected.z < 1);
      }
      art.geometry.dispose(); art.material.dispose();
    });
  }
}

test('perspective fitting uses the camera up axis and accounts for corner depth', () => {
  const direction = new Vector3(0.4, 0.8, 1).normalize();
  const points = [[-1, -8, 5], [1, 8, -5], [-1, 8, 5], [1, -8, -5]];
  const distance = fitPerspectiveDistance(points, direction.toArray(), 34, 2);
  const camera = new PerspectiveCamera(34, 2, 0.1, 120);
  camera.position.copy(direction).multiplyScalar(distance);
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  for (const point of points) {
    const projected = new Vector3(...point).project(camera);
    assert.ok(Math.abs(projected.x) <= 1 / 1.16 + 1e-9);
    assert.ok(Math.abs(projected.y) <= 1 / 1.16 + 1e-9);
  }
});


for(const [width,height,fov] of [[360,300,48],[960,422,34],[256,300,48]])test(`whole-product presets use the available ${width}px viewport without cropping`,()=>{
  const offsets=[];
  for(const x of [-6,6])for(const y of [-2.5,2.5])for(const z of [-0.75,0.75])offsets.push([x,y,z]);
  let previous=0;
  for(const padding of [1.10,1.42]) {
    const distance=fitPerspectiveDistance(offsets,direction.toArray(),fov,width/height,padding);
    assert.ok(distance>previous);previous=distance;
    const camera=new PerspectiveCamera(fov,width/height,0.1,120);
    camera.position.copy(direction).multiplyScalar(distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const projected=offsets.map(v=>new Vector3(...v).project(camera));
    for(const p of projected)assert.ok(Math.abs(p.x)<=1/padding+1e-9&&Math.abs(p.y)<=1/padding+1e-9);
    const span=Math.max(...projected.map(v=>v.x))-Math.min(...projected.map(v=>v.x));
    assert.ok(span>1,'the product occupies over half the display width');
  }
});
