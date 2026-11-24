import { clamp } from './behavior.mjs';

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

export function coast(state, time) {
  const friction = 4.1;
  const decay = Math.exp(-friction * time);
  const travel = (1 - decay) / friction;
  return { x: state.x + state.vx * travel, y: state.y + state.vy * travel, vx: state.vx * decay, vy: state.vy * decay };
}

function reflect(position, velocity, lower, upper, restitution) {
  if (lower >= upper) return { position: lower, velocity: 0, impact: 0 };
  if (position < lower) {
    return { position: Math.min(upper, lower + (lower - position) * restitution), velocity: Math.abs(velocity) * restitution, impact: Math.abs(velocity) };
  }
  if (position > upper) {
    return { position: Math.max(lower, upper - (position - upper) * restitution), velocity: -Math.abs(velocity) * restitution, impact: Math.abs(velocity) };
  }
  return { position, velocity, impact: 0 };
}

export function contain(state, limits, restitution) {
  const x = reflect(state.x, state.vx, limits.left, limits.right, restitution);
  const y = reflect(state.y, state.vy, limits.top, limits.bottom, restitution);
  return {
    x: x.position, y: y.position, vx: x.velocity, vy: y.velocity,
    impact: x.impact >= y.impact ? { axis: 'x', speed: x.impact } : { axis: 'y', speed: y.impact },
  };
}

export function releaseVelocity(state, samples, time) {
  const start = samples[0];
  const end = samples.at(-1);
  const elapsed = start && end ? (end.time - start.time) / 1000 : 0;
  const estimateX = elapsed > 0.016 ? (end.x - start.x) / elapsed : 0;
  const estimateY = elapsed > 0.016 ? (end.y - start.y) / elapsed : 0;
  const still = start && end && time - end.time < 28 && Math.hypot(end.x - start.x, end.y - start.y) < 2;
  const vx = still ? state.vx * 0.35 : state.vx * 0.72 + estimateX * 0.39;
  const vy = still ? state.vy * 0.35 : state.vy * 0.72 + estimateY * 0.39;
  return { vx: clamp(vx, -1250, 1250), vy: clamp(vy, -1250, 1250) };
}

export function joinAreas(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
