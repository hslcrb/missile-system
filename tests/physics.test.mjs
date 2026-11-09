import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp01, flightPoint, stepBody, FIXED_STEP } from '../src/physics.js';

test('time remains clamped for the decorative flight curve', () => {
  assert.equal(clamp01(-2), 0);
  assert.equal(clamp01(3), 1);
  assert.equal(clamp01(NaN), 0);
  const start = flightPoint(-2, { x: 2, y: 1, z: 4 }, 2);
  const end = flightPoint(99, { x: 2, y: 1, z: 4 }, 2);
  assert.equal(start.y, 1);
  assert.equal(end.y, 25);
  assert.ok(end.x > start.x);
});

test('decorative ascent rises monotonically, without real trajectory data', () => {
  const at = p => flightPoint(p, { x: 0, y: 1, z: 0 }, 0).y;
  for (let i = 1; i <= 100; i++) assert.ok(at(i / 100) >= at((i - 1) / 100));
});

test('debris falls and bounces without passing through floor', () => {
  const body = { x: 0, y: 1, z: 0, vx: 1, vy: -8, vz: 0, gravity: -18, restitution: 0.4 };
  for (let i = 0; i < 20; i++) {
    stepBody(body, FIXED_STEP);
    assert.ok(body.y >= 0);
  }
  assert.ok(body.y >= 0);
});

test('drag decreases horizontal speed and invalid delta does not move', () => {
  const body = { x: 1, y: 10, z: 3, vx: 10, vy: 0, vz: -5, gravity: 0, drag: 1 };
  stepBody(body, 0);
  assert.equal(body.x, 1);
  stepBody(body, FIXED_STEP);
  assert.ok(body.vx < 10);
  assert.ok(Math.abs(body.vz) < 5);
});
