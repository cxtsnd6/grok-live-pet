import { MochiView } from '/third_party/mochi2d.mjs';
import { statusLabels } from '/app/behavior.mjs';

const canvas = document.getElementById('model');
const figure = document.getElementById('figure');
const hitSurface = document.getElementById('pet');
const statusBadge = document.getElementById('status');
const statusText = document.getElementById('status-text');
const statusCount = document.getElementById('status-count');
const api = window.grokPet;

let prefs = { size: 176, bubble: true };
let status = { phase: 'idle', at: 0, count: 0 };
let bounce = null;
let view = null;
let failure = false;

function showStatus() {
  const phase = failure && !statusLabels[status.phase] ? 'unavailable' : status.phase;
  statusBadge.hidden = !prefs.bubble || phase === 'idle';
  statusBadge.dataset.phase = phase;
  statusText.textContent = phase === 'unavailable' ? '静态预览' : statusLabels[phase] ?? '';
  statusCount.hidden = status.count < 2;
  statusCount.textContent = status.count >= 2 ? `· ${status.count} 会话` : '';
}

function spring() {
  const current = getComputedStyle(figure).transform;
  bounce?.cancel();
  bounce = figure.animate([
    { transform: current, offset: 0, easing: 'cubic-bezier(.34,.08,.62,1)' },
    { transform: 'scale(1.12, 0.85)', offset: 0.14, easing: 'cubic-bezier(.18,.63,.38,1)' },
    { transform: 'scale(0.95, 1.09)', offset: 0.36, easing: 'ease-in-out' },
    { transform: 'scale(1.029, 0.962)', offset: 0.57, easing: 'ease-in-out' },
    { transform: 'scale(0.993, 1.013)', offset: 0.77, easing: 'ease-out' },
    { transform: 'scale(1, 1)', offset: 1 },
  ], { duration: 510 });
}

api.settings((next) => {
  prefs = next;
  document.documentElement.style.setProperty('--size', `${prefs.size}px`);
  showStatus();
});
api.status((next) => {
  status = next;
  showStatus();
});
api.bounce(spring);

let pointer = null;
hitSurface.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || pointer !== null) return;
  pointer = event.pointerId;
  hitSurface.setPointerCapture(pointer);
  api.pointer('down');
});
hitSurface.addEventListener('pointerup', (event) => {
  if (pointer !== event.pointerId) return;
  pointer = null;
  api.pointer('up');
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  hitSurface.addEventListener(type, (event) => {
    if (pointer !== event.pointerId) return;
    pointer = null;
    api.pointer('cancel');
  });
}
hitSurface.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  api.pointer('menu');
});

async function loadModel() {
  try {
    view = new MochiView(canvas, { autoStart: false, look: 'off', fit: 0.95, maxPixelRatio: 2 });
    const model = await view.load('/assets/model/GrokChibi.model3.json');
    for (const effect of ['look', 'eyeBlink', 'breath', 'idle']) model.setEffect(effect, false);
    const render = () => view.advance(0);
    new ResizeObserver(render).observe(canvas);
    render();
    document.body.dataset.model = 'live2d';
  } catch (error) {
    failure = true;
    console.error('Grok Chibi could not be loaded', error);
    document.getElementById('fallback').hidden = false;
    document.body.dataset.model = 'fallback';
    showStatus();
  }
}

loadModel();
