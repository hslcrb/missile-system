/**
 * Kinetic Lab: intentionally stylized animation helpers.
 * These constants and paths are ART-DIRECTED, not representative of any
 * real-world vehicle, weapon, trajectory, propulsion or blast yield.
 */
export const FIXED_STEP = 1 / 60;

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Decorative non-ballistic ascent curve with arbitrary scene units. */
export function flightPoint(progress, origin, variant = 0) {
  const t = clamp01(progress);
  const direction = variant % 2 === 0 ? 1 : -1;
  return {
    x: origin.x + direction * (3.3 * t + 2.3 * Math.sin(t * Math.PI * 0.85)),
    y: origin.y + 24 * (1 - Math.pow(1 - t, 1.7)),
    z: origin.z - 6 * t + Math.sin(variant * 2.3) * t * 1.6
  };
}

/** Small deterministic Euler solver for decorative debris and floor bounces. */
export function stepBody(body, dt, floorY = 0) {
  if (!Number.isFinite(dt) || dt <= 0) return body;
  const drag = Math.max(0, body.drag ?? 0.18);
  const decay = Math.exp(-drag * dt);
  body.vx *= decay;
  body.vz *= decay;
  body.vy = body.vy * decay + (body.gravity ?? -20) * dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.z += body.vz * dt;
  if (body.y < floorY) {
    body.y = floorY;
    if (body.vy < 0) body.vy = -body.vy * Math.max(0, Math.min(1, body.restitution ?? 0.35));
    const friction = Math.max(0, Math.min(1, body.friction ?? 0.76));
    body.vx *= friction;
    body.vz *= friction;
    if (Math.abs(body.vy) < 0.45) body.vy = 0;
  }
  return body;
}
