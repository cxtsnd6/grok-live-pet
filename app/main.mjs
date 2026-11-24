import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, protocol, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { areaLimits, avatarHit, clamp, clampPosition, currentStatus, desktopSize, distance, readPreferences, sizes, statusLabels } from './behavior.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const storage = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'GrokLivePet');
const preferencesPath = path.join(storage, 'preferences.json');
const manualStartPath = path.join(storage, 'manual-start');
const eventsPath = path.join(storage, 'events');
const userData = path.join(storage, 'desktop');
const page = 'grokpet://app/app/renderer/index.html';
const actionMenu = [
  ['打个招呼', 'wave'], ['摸摸头', 'pat'], ['投喂点心', 'feed'], ['伸个懒腰', 'stretch'],
  ['转个圈', 'twirl'], ['庆祝一下', 'celebrate'], ['出去走走', 'walk'], ['打个盹', 'nap'],
];
const preferenceMenu = [
  ['始终置顶', 'onTop'], ['跟随视线', 'look'], ['自动散步', 'roam'],
  ['粒子效果', 'effects'], ['任务气泡', 'bubble'], ['鼠标穿透', 'passthrough'],
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
  let prefs = readPreferences(readJson(preferencesPath, {}));
  let status = { phase: 'idle', at: 0, count: 0 };
  let windowReady = false;
  let ignoreMouse = false;
  let gesture = null;
  let flight = null;
  let walk = null;
  let peek = null;
  let sleeping = false;
  let lastTap = null;
  let lastInteraction = Date.now();
  let nextWalk = lastInteraction + 45_000;
  let lastCursor = null;
  let lastTick = performance.now();
  let hostTick = 0;

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
  tray.on('click', () => (win.isVisible() ? win.hide() : show()));
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
  tray.setToolTip('Grok Live Pet');
  app.on('second-instance', (_event, args) => { if (!args.includes('--automatic')) show(); });

  function initialPosition(bounds) {
    if (prefs.position) {
      const { x, y } = prefs.position;
      const display = screen.getDisplayNearestPoint({ x: Math.round(x + bounds.width / 2), y: Math.round(y + bounds.height / 2) });
      return clampPosition(prefs.position, display.workArea, bounds);
    }
    const area = screen.getPrimaryDisplay().workArea;
    const limits = areaLimits(area, bounds);
    return { x: Math.max(limits.left, limits.right - 12), y: limits.ground };
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
    if (!peek) {
      const { x, y } = win.getBounds();
      prefs.position = { x, y };
      savePreferences();
    }
  }

  function position(point) {
    win.setPosition(Math.round(point.x), Math.round(point.y));
  }

  function applyPreferences() {
    win.setAlwaysOnTop(prefs.onTop, 'floating');
    send('pet:settings', prefs);
  }

  function updateSize(size) {
    wake();
    leavePeek();
    const bounds = win.getBounds();
    const next = desktopSize(size);
    const { workArea } = screen.getDisplayMatching(bounds);
    const point = { x: bounds.x + (bounds.width - next.width) / 2, y: bounds.y + bounds.height - next.height };
    const clamped = clampPosition(point, workArea, next);
    prefs.size = size;
    win.setBounds({ ...next, x: Math.round(clamped.x), y: Math.round(clamped.y) });
    rememberPosition();
    applyPreferences();
  }

  function show() {
    if (win.isDestroyed()) return;
    win.showInactive();
    wake();
  }

  function play(action) {
    send('pet:action', action);
  }

  function wake() {
    lastInteraction = Date.now();
    if (sleeping) {
      sleeping = false;
      play('wake');
    }
  }

  function nap() {
    if (sleeping) {
      wake();
    } else {
      sleeping = true;
      play('nap');
    }
  }

  function act(action) {
    if (!win.isVisible()) show();
    if (action === 'nap') return nap();
    wake();
    if (action === 'walk') return beginWalk();
    play(action);
  }

  function resetPosition() {
    gesture = flight = walk = null;
    peek = null;
    prefs.position = null;
    position(initialPosition(win.getBounds()));
    rememberPosition();
    wake();
  }

  function buildMenu() {
    return Menu.buildFromTemplate([
      { label: win.isVisible() ? '隐藏桌宠' : '显示桌宠', click: () => (win.isVisible() ? win.hide() : show()) },
      { label: '互动动作', submenu: actionMenu.map(([label, action]) => ({ label, click: () => act(action) })) },
      { label: '桌宠大小', submenu: sizes.map((size) => ({
        label: `${size} 像素`, type: 'radio', checked: prefs.size === size, click: () => updateSize(size),
      })) },
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

  function leavePeek() {
    if (!peek) return;
    const bounds = win.getBounds();
    position(clampPosition(bounds, peek.area, bounds));
    peek = null;
  }

  function startPeek(side, area, y) {
    const bounds = win.getBounds();
    const limits = areaLimits(area, bounds);
    const shift = Math.round(bounds.width * 0.34);
    const edge = side < 0 ? limits.left : limits.right;
    peek = { side, area, edge, tucked: edge + side * shift, y, returnAt: 0 };
    position({ x: peek.tucked, y });
    play('peek');
  }

  function beginWalk() {
    if (gesture || flight || walk || peek) return;
    const box = win.getBounds();
    const { workArea } = screen.getDisplayMatching(box);
    const limits = areaLimits(workArea, box);
    const direction = box.x - limits.left < limits.right - box.x ? 1 : -1;
    const target = clamp(box.x + direction * (80 + Math.random() * 76), limits.left, limits.right);
    if (Math.abs(target - box.x) < 8) return;
    walk = { x: box.x, y: box.y, target, direction };
    nextWalk = Date.now() + 48_000 + Math.random() * 30_000;
  }

  function sampleDrag(cursor, now) {
    if (distance(gesture.start, cursor) >= 6) gesture.dragging = true;
    if (!gesture.dragging) return;
    leavePeek();
    gesture.samples.push({ ...cursor, now });
    gesture.samples = gesture.samples.filter((sample) => now - sample.now <= 135);
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const point = { x: cursor.x - gesture.offset.x, y: cursor.y - gesture.offset.y };
    position(clampPosition(point, area, win.getBounds()));
  }

  function beginGesture() {
    if (prefs.passthrough) return;
    const cursor = screen.getCursorScreenPoint();
    const box = win.getBounds();
    const hit = avatarHit(mask, cursor, box, prefs.size);
    if (!hit) return;
    gesture = { start: cursor, offset: { x: cursor.x - box.x, y: cursor.y - box.y }, hit, samples: [], dragging: false };
    flight = walk = null;
    wake();
  }

  function finishGesture() {
    if (!gesture) return;
    const cursor = screen.getCursorScreenPoint();
    const now = performance.now();
    const drag = gesture;
    sampleDrag(cursor, now);
    gesture = null;
    if (!drag.dragging) {
      if (peek && !peek.returnAt) {
        position({ x: peek.edge, y: peek.y });
        peek.returnAt = Date.now() + 5000;
      }
      if (lastTap && now - lastTap.now < 420 && distance(cursor, lastTap.cursor) < 24) {
        play('feed');
        lastTap = null;
      } else {
        lastTap = { now, cursor };
        play(drag.hit === 'head' ? 'pat' : 'poke');
      }
      return;
    }

    const box = win.getBounds();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const limits = areaLimits(area, box);
    lastTap = null;
    const first = drag.samples[0];
    if (first && now - first.now >= 20 && distance(first, cursor) >= 28) {
      const factor = 1000 / (now - first.now);
      const vx = clamp((cursor.x - first.x) * factor, -960, 960);
      const vy = clamp((cursor.y - first.y) * factor, -830, 530);
      flight = { x: box.x, y: box.y, vx, vy, limits, start: now };
      play('launch');
    } else if (box.x - limits.left < 6 && limits.right - limits.left > box.width) {
      startPeek(-1, area, box.y);
    } else if (limits.right - box.x < 6 && limits.right - limits.left > box.width) {
      startPeek(1, area, box.y);
    } else {
      rememberPosition();
      play('settle');
    }
  }

  function slingshot() {
    const cursor = screen.getCursorScreenPoint();
    const { x, y } = gesture.start;
    const now = performance.now();
    sampleDrag(cursor, now);
    gesture = null;
    lastTap = null;
    const box = win.getBounds();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    flight = {
      x: box.x, y: box.y, limits: areaLimits(area, box), start: now,
      vx: clamp((x - cursor.x) * 8, -1050, 1050),
      vy: clamp((y - cursor.y) * 7 - 200, -900, 400),
    };
    play('launch');
  }

  function stepFlight(dt, now) {
    const { left, right, top, ground } = flight.limits;
    flight.x += flight.vx * dt;
    flight.y += flight.vy * dt;
    flight.vy += 1760 * dt;
    flight.vx *= 0.994;
    if (flight.x < left || flight.x > right) {
      flight.x = clamp(flight.x, left, right);
      flight.vx *= -0.57;
    }
    if (flight.y < top) {
      flight.y = top;
      flight.vy = Math.abs(flight.vy) * 0.4;
    }
    if (flight.y >= ground) {
      flight.y = ground;
      flight.vx *= 0.72;
      flight.vy *= -0.48;
      if (Math.abs(flight.vy) < 140 || now - flight.start > 2600) {
        position(flight);
        flight = null;
        play('settle');
        rememberPosition();
        return;
      }
    }
    position(flight);
  }

  function stepWalk(dt) {
    const step = walk.direction * 70 * dt;
    if (Math.abs(walk.target - walk.x) <= Math.abs(step)) {
      position({ x: walk.target, y: walk.y });
      walk = null;
      rememberPosition();
    } else {
      walk.x += step;
      position(walk);
    }
  }

  function readStatus(now) {
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
      if (next.phase !== 'idle') wake();
      send('pet:status', status);
      tray.setToolTip(statusLabels[status.phase] ? `Grok Build · ${statusLabels[status.phase]}` : 'Grok Live Pet');
    }
  }

  function tick() {
    const now = performance.now();
    const wall = Date.now();
    const dt = Math.min((now - lastTick) / 1000, 0.067);
    lastTick = now;
    if (++hostTick % 10 === 0) readStatus(wall);
    if (!win.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    if (gesture) sampleDrag(cursor, now);
    if (flight) stepFlight(dt, now);
    if (walk) stepWalk(dt);
    if (peek?.returnAt && wall >= peek.returnAt) {
      position({ x: peek.tucked, y: peek.y });
      peek.returnAt = 0;
    }

    const box = win.getBounds();
    const hit = avatarHit(mask, cursor, box, prefs.size);
    const shouldIgnore = prefs.passthrough || (!gesture && !hit);
    if (ignoreMouse !== shouldIgnore) {
      ignoreMouse = shouldIgnore;
      win.setIgnoreMouseEvents(ignoreMouse, { forward: true });
    }
    if (lastCursor && distance(lastCursor, cursor) > 1 && hit) wake();
    lastCursor = cursor;
    const idle = status.phase === 'idle' || status.phase === 'ready';
    if (!sleeping && idle && wall - lastInteraction > 92_000 && !gesture && !flight && !walk) nap();
    if (prefs.roam && idle && !sleeping && !hit && wall > nextWalk) beginWalk();

    send('pet:frame', {
      x: prefs.look ? clamp((cursor.x - box.x - box.width * 0.5) / 480, -1, 1) : 0,
      y: prefs.look ? clamp((box.y + 62 + prefs.size * 0.38 - cursor.y) / 400, -1, 1) : 0,
      moving: walk?.direction ?? 0,
      drag: Boolean(gesture?.dragging),
      flight: flight ? clamp(flight.vx / 800, -1, 1) : 0,
      air: Boolean(flight),
      peek: peek && !peek.returnAt ? peek.side : 0,
      sleeping,
    });
  }

  ipcMain.on('pet:pointer', (event, type) => {
    if (event.sender !== win.webContents) return;
    if (type === 'down') beginGesture();
    if (type === 'up') finishGesture();
    if (type === 'cancel') { gesture = null; rememberPosition(); }
    if (type === 'menu' && !prefs.passthrough) {
      if (gesture?.dragging) slingshot();
      else buildMenu().popup({ window: win });
    }
  });
  const timer = setInterval(tick, 32);
  app.on('before-quit', () => clearInterval(timer));
  for (const event of ['display-removed', 'display-metrics-changed']) {
    screen.on(event, () => {
      if (win.isDestroyed()) return;
      leavePeek();
      const bounds = win.getBounds();
      position(clampPosition(bounds, screen.getDisplayMatching(bounds).workArea, bounds));
      rememberPosition();
    });
  }

  win.webContents.once('did-finish-load', () => {
    windowReady = true;
    applyPreferences();
    send('pet:status', status);
    if (status.phase === 'idle') readStatus(Date.now());
  });
  win.once('ready-to-show', show);
  win.loadURL(page).catch((error) => console.error('Could not load Grok Live Pet', error.message));
}
