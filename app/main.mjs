import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, protocol, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { areaLimits, avatarBox, avatarHit, clamp, clampPosition, currentStatus, defaults, desktopSize, distance, maximumSize, minimumSize, readPreferences, statusLabels } from './behavior.mjs';
import { beginCoast, coast, contain, follow, glideFriction, glideRestitution, joinAreas, releaseVelocity, throwFriction, throwRestitution } from './motion.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const storage = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'GrokLivePet');
const preferencesPath = path.join(storage, 'preferences.json');
const manualStartPath = path.join(storage, 'manual-start');
const eventsPath = path.join(storage, 'events');
const userData = path.join(storage, 'desktop');
const page = 'grokpet://app/app/renderer/index.html';
const preferenceMenu = [
  ['始终置顶', 'onTop'], ['任务气泡', 'bubble'], ['鼠标穿透', 'passthrough'],
];

function readJson(filename, fallback) {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { return fallback; }
}

fs.mkdirSync(userData, { recursive: true });
app.setName('Grok Live Pet');
app.setPath('userData', userData);
app.setAppUserModelId('community.grok-live-pet');
protocol.registerSchemesAsPrivileged([
  { scheme: 'grokpet', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(start);
}

function start() {
  const mask = readJson(path.join(root, 'assets/model/HitMask.json'), []);
  const prefs = readPreferences(readJson(preferencesPath, {}));
  let status = { phase: 'idle', at: 0, count: 0 };
  let windowReady = false;
  let ignoreMouse = false;
  let gesture = null;
  let glide = null;
  let zoom = null;
  let lastTick = performance.now();
  let lastImpact = -Infinity;
  let lastTilt = 0;

  protocol.handle('grokpet', (request) => {
    const url = new URL(request.url);
    const allowed = /^\/(?:app\/(?:behavior\.mjs|renderer\/[\w.-]+)|assets\/model\/[\w.-]+|assets\/source\/grok-chibi\.png|third_party\/mochi2d\.mjs)$/;
    if (request.method !== 'GET' || url.hostname !== 'app' || !allowed.test(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(path.join(root, url.pathname.slice(1))).href);
  });

  const dimensions = desktopSize(prefs.size);
  const win = new BrowserWindow({
    ...dimensions,
    ...initialPosition(dimensions),
    title: 'Grok Live Pet',
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: prefs.onTop,
    show: false,
    backgroundColor: '#00000000',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(root, 'app/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setVisibleOnAllWorkspaces(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (url !== page) event.preventDefault(); });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);

  const trayIcon = nativeImage.createFromPath(path.join(root, 'assets/model/Icon.png')).resize({ width: 32, height: 32 });
  const tray = new Tray(trayIcon);
  tray.on('click', toggleVisibility);
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  tray.setToolTip('Grok Live Pet');
  app.on('second-instance', (_event, args) => { if (!args.includes('--automatic')) win.showInactive(); });

  function initialPosition(bounds) {
    if (prefs.position) {
      const { x, y } = prefs.position;
      const center = { x: Math.round(x + bounds.width / 2), y: Math.round(y + bounds.height / 2) };
      const point = clampPosition(prefs.position, screen.getDisplayNearestPoint(center).workArea, bounds, prefs.size);
      return { x: Math.round(point.x), y: Math.round(point.y) };
    }
    const limits = areaLimits(screen.getPrimaryDisplay().workArea, bounds, prefs.size);
    return { x: Math.round(Math.max(limits.left, limits.right - 12)), y: Math.round(limits.bottom - 4) };
  }

  function send(channel, value) {
    if (windowReady && !win.isDestroyed()) win.webContents.send(channel, value);
  }

  function savePreferences() {
    const tmp = `${preferencesPath}.tmp`;
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(prefs, null, 2)}\n`);
      fs.renameSync(tmp, preferencesPath);
    } catch (error) {
      console.error('Could not save Grok Live Pet preferences', error.message);
    }
  }

  function rememberPosition() {
    const { x, y } = win.getBounds();
    prefs.position = { x, y };
    savePreferences();
  }

  function position(point) {
    win.setPosition(Math.round(point.x), Math.round(point.y));
  }

  function applyPreferences() {
    win.setAlwaysOnTop(prefs.onTop, 'floating');
    send('pet:settings', prefs);
  }

  function toggleVisibility() {
    if (win.isVisible()) win.hide();
    else win.showInactive();
  }

  function resetPosition() {
    gesture = null;
    glide = zoom = null;
    showMotion({ vx: 0 }, performance.now());
    prefs.position = null;
    position(initialPosition(win.getBounds()));
    rememberPosition();
  }

  function buildMenu() {
    return Menu.buildFromTemplate([
      { label: win.isVisible() ? '隐藏桌宠' : '显示桌宠', click: toggleVisibility },
      { label: '恢复默认大小', click: () => zoomTo(defaults.size) },
      { type: 'separator' },
      ...preferenceMenu.map(([label, key]) => ({ label, type: 'checkbox', checked: prefs[key], click: (item) => {
        prefs[key] = item.checked;
        savePreferences();
        applyPreferences();
      } })),
      { label: '随 Grok Build 启动', type: 'checkbox', checked: !fs.existsSync(manualStartPath), click: (item) => {
        if (item.checked) fs.rmSync(manualStartPath, { force: true });
        else fs.writeFileSync(manualStartPath, '');
      } },
      { type: 'separator' },
      { label: '回到右下角', click: resetPosition },
      { label: '退出桌宠', click: () => app.quit() },
    ]);
  }

  function zoomTo(size) {
    glide = null;
    showMotion({ vx: 0 }, performance.now());
    if (!zoom) {
      const bounds = win.getBounds();
      const box = avatarBox(bounds, prefs.size);
      zoom = {
        target: prefs.size,
        anchor: { x: bounds.x + bounds.width / 2, y: bounds.y + box.y + box.height },
        area: screen.getDisplayMatching(bounds).workArea,
      };
    }
    const limit = Math.max(minimumSize, Math.min(maximumSize, zoom.area.height - 64, zoom.area.width - 24));
    zoom.target = clamp(size, minimumSize, limit);
  }

  function stepZoom(dt) {
    const difference = zoom.target - prefs.size;
    const done = Math.abs(difference) < 0.45;
    const size = done ? zoom.target : prefs.size + difference * (1 - Math.exp(-dt * 19));
    if (size !== prefs.size) {
      const bounds = desktopSize(size);
      const box = avatarBox(bounds, size);
      const point = { x: zoom.anchor.x - bounds.width / 2, y: zoom.anchor.y - box.y - box.height };
      const next = clampPosition(point, zoom.area, bounds, size);
      prefs.size = size;
      win.setBounds({ ...bounds, x: Math.round(next.x), y: Math.round(next.y) });
      send('pet:settings', prefs);
    }
    if (done && !gesture?.resize) {
      zoom = null;
      rememberPosition();
    }
  }

  function motionArea(box, cursor) {
    const center = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 62 + prefs.size / 2) };
    const current = screen.getDisplayNearestPoint(center);
    if (!cursor) return current.workArea;
    const target = screen.getDisplayNearestPoint(cursor);
    return current.id === target.id ? current.workArea : joinAreas(current.workArea, target.workArea);
  }

  function showMotion(state, now) {
    const tilt = Math.round(clamp(state.vx / 220, -4, 4) * 10) / 10;
    if (tilt !== lastTilt) {
      lastTilt = tilt;
      send('pet:tilt', tilt);
    }
    if (state.impact?.speed > 90 && now - lastImpact > 160) {
      lastImpact = now;
      send('pet:impact', state.impact);
    }
  }

  function beginGesture(resize) {
    if (prefs.passthrough) return;
    const cursor = screen.getCursorScreenPoint();
    const box = win.getBounds();
    if (!avatarHit(mask, cursor, box, prefs.size)) return;
    if (zoom || glide) rememberPosition();
    glide = zoom = null;
    const now = performance.now();
    showMotion({ vx: 0 }, now);
    gesture = {
      origin: cursor, offset: { x: cursor.x - box.x, y: cursor.y - box.y }, resize, size: prefs.size,
      dragging: false, state: { x: box.x, y: box.y, vx: 0, vy: 0 }, samples: [{ ...cursor, time: now }],
    };
  }

  function moveGesture(cursor, dt, now) {
    if (!gesture.dragging) gesture.dragging = distance(gesture.origin, cursor) >= 6;
    if (!gesture.dragging) return;
    if (gesture.resize) {
      zoomTo(gesture.size * Math.exp((cursor.y - gesture.origin.y) / 200));
      return;
    }
    gesture.samples.push({ ...cursor, time: now });
    gesture.samples = gesture.samples.filter((sample) => now - sample.time < 110);
    const box = win.getBounds();
    const area = motionArea(box, cursor);
    const limits = areaLimits(area, box, prefs.size);
    const point = { x: cursor.x - gesture.offset.x, y: cursor.y - gesture.offset.y };
    const target = { x: clamp(point.x, limits.left - 12, limits.right + 12), y: clamp(point.y, limits.top - 12, limits.bottom + 12) };
    gesture.state = contain(follow(gesture.state, target, dt), limits, 0.42);
    position(gesture.state);
    showMotion(gesture.state, now);
  }

  function finishGesture() {
    if (!gesture) return;
    const cursor = screen.getCursorScreenPoint();
    const now = performance.now();
    moveGesture(cursor, clamp((now - lastTick) / 1000, 0.003, 0.024), now);
    const previous = gesture;
    gesture = null;
    if (previous.resize) return;
    const box = win.getBounds();
    if (!previous.dragging) { send('pet:bounce'); return; }
    const velocity = releaseVelocity(previous.state, previous.samples, now);
    const area = motionArea(box, cursor);
    glide = { ...beginCoast(previous.state, velocity, areaLimits(area, box, prefs.size)), area, started: now };
  }

  function stepGlide(dt, now) {
    const limits = areaLimits(glide.area, win.getBounds(), prefs.size);
    const throwing = glide.bounces > 0 && now - glide.started < 5200;
    const next = contain(coast(glide, dt, throwing ? throwFriction : glideFriction),
      limits, throwing ? throwRestitution : glideRestitution);
    position(next);
    showMotion(next, now);
    if (Math.hypot(next.vx, next.vy) < 18) {
      glide = null;
      showMotion({ vx: 0 }, now);
      rememberPosition();
    } else {
      glide = { ...next, area: glide.area, started: glide.started, bounces: Math.max(0, glide.bounces - next.hits) };
    }
  }

  function readStatus() {
    const now = Date.now();
    let files = [];
    try { files = fs.readdirSync(eventsPath); } catch { /* Grok has not sent an event yet. */ }
    const events = [];
    for (const file of files) {
      if (!/^[a-f0-9]{24}\.json$/.test(file)) continue;
      const filename = path.join(eventsPath, file);
      const event = readJson(filename, null);
      if (event && now - event.at < 86_400_000) events.push(event);
      else if (event && now - event.at > 86_400_000) {
        try { if (now - fs.statSync(filename).mtimeMs > 86_400_000) fs.unlinkSync(filename); } catch { /* Hook may replace it. */ }
      }
    }
    const next = currentStatus(events, now);
    if (next.phase !== status.phase || next.at !== status.at || next.count !== status.count) {
      status = next;
      send('pet:status', status);
      tray.setToolTip(statusLabels[status.phase] ? `Grok Build · ${statusLabels[status.phase]}` : 'Grok Live Pet');
    }
  }

  function tickPointer() {
    const now = performance.now();
    const dt = clamp((now - lastTick) / 1000, 0.001, 0.05);
    lastTick = now;
    if (!win.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    if (gesture) moveGesture(cursor, dt, now);
    if (glide) stepGlide(dt, now);
    if (zoom) stepZoom(dt);
    const hit = avatarHit(mask, cursor, win.getBounds(), prefs.size);
    const shouldIgnore = prefs.passthrough || (!gesture && !hit);
    if (ignoreMouse !== shouldIgnore) {
      ignoreMouse = shouldIgnore;
      win.setIgnoreMouseEvents(ignoreMouse, { forward: true });
    }
  }

  ipcMain.on('pet:pointer', (event, type) => {
    if (event.sender !== win.webContents) return;
    if (type === 'down' || type === 'resize') beginGesture(type === 'resize');
    if (type === 'up') finishGesture();
    if (type === 'cancel' && gesture) {
      if (gesture.dragging) rememberPosition();
      gesture = null;
      showMotion({ vx: 0 }, performance.now());
    }
    if (type === 'menu' && !prefs.passthrough && !gesture) buildMenu().popup({ window: win });
  });

  ipcMain.on('pet:wheel', (event, delta) => {
    if (event.sender !== win.webContents || prefs.passthrough || gesture || !Number.isFinite(delta)) return;
    if (!avatarHit(mask, screen.getCursorScreenPoint(), win.getBounds(), prefs.size)) return;
    zoomTo((zoom?.target ?? prefs.size) * Math.exp(-clamp(delta, -200, 200) * 0.00135));
  });

  const pointerTimer = setInterval(tickPointer, 16);
  const statusTimer = setInterval(readStatus, 320);
  app.on('before-quit', () => { clearInterval(pointerTimer); clearInterval(statusTimer); });
  for (const event of ['display-removed', 'display-metrics-changed']) {
    screen.on(event, () => {
      if (win.isDestroyed()) return;
      gesture = glide = zoom = null;
      showMotion({ vx: 0 }, performance.now());
      const bounds = win.getBounds();
      position(clampPosition(bounds, screen.getDisplayMatching(bounds).workArea, bounds, prefs.size));
      rememberPosition();
    });
  }

  win.webContents.once('did-finish-load', () => {
    windowReady = true;
    applyPreferences();
    readStatus();
    send('pet:status', status);
  });
  win.once('ready-to-show', () => win.showInactive());
  win.loadURL(page).catch((error) => console.error('Could not load Grok Live Pet', error.message));
}
