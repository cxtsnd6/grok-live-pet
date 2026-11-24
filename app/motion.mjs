import { clamp } from './behavior.mjs';

export const glideFriction = 3;
export const glideRestitution = 0.68;
export const throwFriction = 0.72;
export const throwRestitution = 0.83;

function springAxis(position, velocity, target, time) {
  const springRate = 37;
  const decay = Math.exp(-springRate * time);
  const offset = position - target;
  const correction = velocity + springRate * offset;
  return {
    position: target + (offset + correction * time) * decay,
    velocity: (velocity - springRate * correction * time) * decay,
  };
}

export function follow(state, target, time) {
  const x = springAxis(state.x, state.vx, target.x, time);
  const y = springAxis(state.y, state.vy, target.y, time);
  return { x: x.position, y: y.position, vx: x.velocity, vy: y.velocity };
}

export function coast(state, time, friction = glideFriction) {
  const decay = Math.exp(-friction * time);
  const travel = (1 - decay) / friction;
  return { x: state.x + state.vx * travel, y: state.y + state.vy * travel, vx: state.vx * decay, vy: state.vy * decay };
}

function reflect(position, velocity, lower, upper, restitution) {
  if (lower >= upper) return { position: lower, velocity: 0, impact: 0 };
  if (position < lower) {
    return { position: lower, velocity: Math.abs(velocity) * restitution, impact: Math.abs(velocity) };
  }
  if (position > upper) {
    return { position: upper, velocity: -Math.abs(velocity) * restitution, impact: Math.abs(velocity) };
  }
  return { position, velocity, impact: 0 };
}

export function contain(state, limits, restitution) {
  const x = reflect(state.x, state.vx, limits.left, limits.right, restitution);
  const y = reflect(state.y, state.vy, limits.top, limits.bottom, restitution);
  return {
    x: x.position, y: y.position, vx: x.velocity, vy: y.velocity,
    hits: Number(x.impact > 0) + Number(y.impact > 0),
    impact: x.impact >= y.impact ? { axis: 'x', speed: x.impact } : { axis: 'y', speed: y.impact },
  };
}

export function releaseVelocity(state, samples, time) {
  const moving = samples.findLastIndex((sample, i) => i > 0 && (sample.x !== samples[i - 1].x || sample.y !== samples[i - 1].y));
  if (moving < 1) return { vx: state.vx * 0.35, vy: state.vy * 0.35 };

  const end = samples[moving];
  const start = samples.slice(0, moving).find((sample) => end.time - sample.time < 76) ?? samples[moving - 1];
  const elapsed = Math.max(0.016, (end.time - start.time) / 1000);
  const weight = 0.52 * Math.exp(-Math.max(0, time - end.time - 16) / 65);
  const vx = state.vx * 0.82 + weight * (end.x - start.x) / elapsed;
  const vy = state.vy * 0.82 + weight * (end.y - start.y) / elapsed;
  return { vx: clamp(vx, -1440, 1440), vy: clamp(vy, -1440, 1440) };
}

export function beginCoast(state, velocity, limits) {
  const speed = Math.hypot(velocity.vx, velocity.vy);
  const spanX = Math.max(1, limits.right - limits.left);
  const spanY = Math.max(1, limits.bottom - limits.top);
  const horizontal = Math.abs(velocity.vx) / spanX >= Math.abs(velocity.vy) / spanY;
  const span = horizontal ? spanX : spanY;
  if (speed < 790 || span < 55) return { ...state, ...velocity, bounces: 0 };

  const axisSpeed = horizontal ? velocity.vx : velocity.vy;
  const position = horizontal ? state.x : state.y;
  const lower = horizontal ? limits.left : limits.top;
  const upper = horizontal ? limits.right : limits.bottom;
  const first = axisSpeed >= 0 ? upper - position : position - lower;
  // Account for travel before two impacts and leave a short glide after the second.
  const required = throwFriction * (Math.max(0, first) + span / throwRestitution) + 510;
  const gain = Math.max(1, required / Math.abs(axisSpeed));
  const boost = Math.min(gain, 6600 / speed);
  return { ...state, vx: velocity.vx * boost, vy: velocity.vy * boost, bounces: 2 };
}

export function joinAreas(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
