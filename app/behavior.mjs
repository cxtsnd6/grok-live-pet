export const minimumSize = 96;
export const maximumSize = 520;
export const defaults = Object.freeze({
  size: 176,
  onTop: true,
  bubble: true,
  passthrough: false,
  position: null,
});

const phases = new Map([
  ['waiting', { priority: 5, lifetime: 10 * 60_000 }],
  ['error', { priority: 4, lifetime: 14_000 }],
  ...['thinking', 'reading', 'editing', 'running'].map((phase) => [phase, { priority: 3, lifetime: 12 * 60_000 }]),
  ['done', { priority: 2, lifetime: 8000 }],
  ['cancelled', { priority: 2, lifetime: 6000 }],
  ['ready', { priority: 1, lifetime: 6000 }],
]);

export const statusLabels = Object.freeze({
  idle: '', ready: '已就绪', thinking: '正在思考', reading: '正在查找', editing: '正在修改',
  running: '正在执行', waiting: '等你确认', done: '任务完成', error: '遇到错误', cancelled: '已暂停',
});

export function currentStatus(events, now) {
  const active = events.filter((event) => {
    const config = phases.get(event?.phase);
    return config && Number.isFinite(event.at) && event.at <= now + 30000 && event.at + config.lifetime > now;
  });
  active.sort((a, b) => phases.get(b.phase).priority - phases.get(a.phase).priority || b.at - a.at);
  return { phase: active[0]?.phase ?? 'idle', at: active[0]?.at ?? 0, count: active.filter((event) => phases.get(event.phase).priority >= 3).length };
}

export function readPreferences(value = {}) {
  value ??= {};
  const prefs = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (typeof defaults[key] === 'boolean' && typeof value[key] === 'boolean') prefs[key] = value[key];
  }
  if (Number.isFinite(value.size)) prefs.size = clamp(value.size, minimumSize, maximumSize);
  if (Number.isFinite(value.position?.x) && Number.isFinite(value.position?.y)) {
    prefs.position = { x: value.position.x, y: value.position.y };
  }
  return prefs;
}

export const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
export const distance = (start, end) => Math.hypot(end.x - start.x, end.y - start.y);

export function desktopSize(size) {
  return { width: Math.max(210, Math.ceil(size + 42)), height: Math.ceil(size + 75) };
}

export function avatarBox(bounds, size) {
  const height = size * 0.95;
  const unit = height / 1458;
  const width = 1122 * unit;
  const top = 62 + (size - height) / 2 + 28 * unit;
  return { x: (bounds.width - width) / 2, y: top, width, height: 1402 * unit };
}

export function areaLimits(area, bounds, size) {
  const figure = avatarBox(bounds, size);
  const margin = 6;
  const left = area.x - figure.x + margin;
  const top = area.y - figure.y + margin;
  return {
    left,
    top,
    right: Math.max(left, area.x + area.width - figure.x - figure.width - margin),
    bottom: Math.max(top, area.y + area.height - figure.y - figure.height - margin),
  };
}

export function clampPosition(point, area, bounds, size) {
  const { left, top, right, bottom } = areaLimits(area, bounds, size);
  return { x: clamp(point.x, left, right), y: clamp(point.y, top, bottom) };
}

export function avatarHit(mask, point, bounds, size) {
  if (!mask.length) return false;
  const height = size * 0.95;
  const width = height * (1178 / 1458);
  const x = (point.x - bounds.x - (bounds.width - width) / 2) / width;
  const y = (point.y - bounds.y - 62 - (size - height) / 2) / height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
  const row = Math.floor(y * mask.length);
  const col = Math.floor(x * mask[row].length);
  return mask[row][col] === '1';
}
