import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, net, protocol, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { areaLimits, avatarHit, clampPosition, currentStatus, desktopSize, distance, readPreferences, sizes, statusLabels } from './behavior.mjs';

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
      return clampPosition(prefs.position, screen.getDisplayNearestPoint(center).workArea, bounds);
    }
    const limits = areaLimits(screen.getPrimaryDisplay().workArea, bounds);
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

  function updateSize(size) {
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

  function toggleVisibility() {
    if (win.isVisible()) win.hide();
    else win.showInactive();
  }

  function resetPosition() {
    gesture = null;
    prefs.position = null;
    position(initialPosition(win.getBounds()));
    rememberPosition();
  }

  function buildMenu() {
    return Menu.buildFromTemplate([
      { label: win.isVisible() ? '隐藏桌宠' : '显示桌宠', click: toggleVisibility },
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

  function beginGesture() {
    if (prefs.passthrough) return;
    const cursor = screen.getCursorScreenPoint();
    const box = win.getBounds();
    if (!avatarHit(mask, cursor, box, prefs.size)) return;
    gesture = { origin: cursor, offset: { x: cursor.x - box.x, y: cursor.y - box.y }, dragging: false };
  }

  function moveGesture(cursor) {
    if (!gesture.dragging) gesture.dragging = distance(gesture.origin, cursor) >= 6;
    if (!gesture.dragging) return;
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const point = { x: cursor.x - gesture.offset.x, y: cursor.y - gesture.offset.y };
    position(clampPosition(point, area, win.getBounds()));
  }

  function finishGesture() {
    if (!gesture) return;
    moveGesture(screen.getCursorScreenPoint());
    if (gesture.dragging) rememberPosition();
    else send('pet:bounce');
    gesture = null;
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
    if (!win.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    if (gesture) moveGesture(cursor);
    const hit = avatarHit(mask, cursor, win.getBounds(), prefs.size);
    const shouldIgnore = prefs.passthrough || (!gesture && !hit);
    if (ignoreMouse !== shouldIgnore) {
      ignoreMouse = shouldIgnore;
      win.setIgnoreMouseEvents(ignoreMouse, { forward: true });
    }
  }

  ipcMain.on('pet:pointer', (event, type) => {
    if (event.sender !== win.webContents) return;
    if (type === 'down') beginGesture();
    if (type === 'up') finishGesture();
    if (type === 'cancel' && gesture) {
      if (gesture.dragging) rememberPosition();
      gesture = null;
    }
    if (type === 'menu' && !prefs.passthrough && !gesture) buildMenu().popup({ window: win });
  });

  const pointerTimer = setInterval(tickPointer, 32);
  const statusTimer = setInterval(readStatus, 320);
  app.on('before-quit', () => { clearInterval(pointerTimer); clearInterval(statusTimer); });
  for (const event of ['display-removed', 'display-metrics-changed']) {
    screen.on(event, () => {
      if (win.isDestroyed()) return;
      const bounds = win.getBounds();
      position(clampPosition(bounds, screen.getDisplayMatching(bounds).workArea, bounds));
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
