export const sizes = [136, 176, 224, 272];
export const defaults = Object.freeze({
  size: 176,
  onTop: true,
  look: true,
  roam: true,
  effects: true,
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
  if (sizes.includes(value.size)) prefs.size = value.size;
  if (Number.isFinite(value.position?.x) && Number.isFinite(value.position?.y)) {
    prefs.position = { x: value.position.x, y: value.position.y };
  }
  return prefs;
}

export const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
export const distance = (start, end) => Math.hypot(end.x - start.x, end.y - start.y);

export function desktopSize(size) {
  return { width: Math.max(228, size + 52), height: size + 91 };
}

export function areaLimits(area, bounds) {
  return {
    left: area.x,
    top: area.y,
    right: Math.max(area.x, area.x + area.width - bounds.width),
    ground: Math.max(area.y, area.y + area.height - bounds.height),
  };
}

export function clampPosition(point, area, bounds) {
  const { left, top, right, ground } = areaLimits(area, bounds);
  return { x: clamp(point.x, left, right), y: clamp(point.y, top, ground) };
}

export function avatarHit(mask, point, bounds, size) {
  if (!mask.length) return '';
  const height = size * 0.95;
  const width = height * (1178 / 1458);
  const x = (point.x - bounds.x - (bounds.width - width) / 2) / width;
  const y = (point.y - bounds.y - 62 - (size - height) / 2) / height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return '';
  const row = Math.floor(y * mask.length);
  const col = Math.floor(x * mask[row].length);
  if (mask[row][col] !== '1') return '';
  return y < 0.43 ? 'head' : 'body';
}
