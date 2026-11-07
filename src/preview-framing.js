import { CANVAS, slots } from './config.js';

// Convert the authored nameplate rectangle to the real print plane's local space.
export function nameplateRegion(width, height) {
  const plate = slots.nameplate;
  const left = (plate.x / CANVAS.width - 0.5) * width;
  const right = ((plate.x + plate.width) / CANVAS.width - 0.5) * width;
  const top = (0.5 - plate.y / CANVAS.height) * height;
  const bottom = (0.5 - (plate.y + plate.height) / CANVAS.height) * height;
  return {
    center: [(left + right) / 2, (top + bottom) / 2, 0],
    corners: [[left, top, 0], [right, top, 0], [left, bottom, 0], [right, bottom, 0]],
  };
}

// Fit projected corners, including their depth, rather than using whole-product bounds.
export function fitPerspectiveDistance(offsets, direction, fov, aspect, padding = 1.16) {
  const length = Math.hypot(...direction);
  const forward = direction.map(value => value / length);
  const horizontalLength = Math.hypot(forward[0], forward[2]);
  const right = [forward[2] / horizontalLength, 0, -forward[0] / horizontalLength];
  const up = [forward[1] * right[2], forward[2] * right[0] - forward[0] * right[2], -forward[1] * right[0]];
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const tangent = Math.tan(fov * Math.PI / 360);
  return Math.max(...offsets.map(point => dot(point, forward) + padding * Math.max(
    Math.abs(dot(point, right)) / (tangent * aspect),
    Math.abs(dot(point, up)) / tangent,
  )));
}
