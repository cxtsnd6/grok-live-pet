import { MochiView } from '/third_party/mochi2d.mjs';
import { statusLabels } from '/app/behavior.mjs';
import { burstStars } from './stars.mjs';

const canvas = document.getElementById('model');
const figure = document.getElementById('figure');
const carrier = document.getElementById('motion');
const starCanvas = document.getElementById('stars');
const hitSurface = document.getElementById('pet');
const statusBadge = document.getElementById('status');
const statusText = document.getElementById('status-text');
const statusCount = document.getElementById('status-count');
const api = window.grokPet;

let prefs = { size: 176, bubble: true };
let status = { phase: 'idle', at: 0, count: 0 };
let bounce = null;
let view = null;
let model = null;
let failure = false;
let blinkTimer = null;
let eyeFrame = null;
let eyeOpening = [1, 1];
let stopStars = null;

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

function collision({ axis, speed }) {
  const amount = Math.min(0.11, speed / 8200);
  const pressed = axis === 'x' ? [1 - amount, 1 + amount * 0.65] : [1 + amount * 0.65, 1 - amount];
  const rebound = pressed.map((value) => 1 - (value - 1) * 0.34);
  const current = getComputedStyle(figure).transform;
  bounce?.cancel();
  bounce = figure.animate([
    { transform: current, offset: 0, easing: 'ease-out' },
    { transform: `scale(${pressed.join(',')})`, offset: 0.18, easing: 'ease-out' },
    { transform: `scale(${rebound.join(',')})`, offset: 0.49, easing: 'ease-in-out' },
    { transform: 'scale(1, 1)', offset: 1 },
  ], { duration: 300 });
}

const ease = (progress) => {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
};

function idleBlink() {
  if (pointer !== null || bounce?.playState === 'running') {
    blinkTimer = setTimeout(idleBlink, 500);
    return;
  }
  animateEyes(false);
}

function animateEyes(wink) {
  if (!model) return;
  clearTimeout(blinkTimer);
  cancelAnimationFrame(eyeFrame);
  model.setParameter('ParamWinkBlend', wink ? 1 : 0);
  const start = performance.now();
  const previous = eyeOpening;
  const duration = wink ? 356 : 150;
  const closeAt = wink ? 0.21 : 0.34;
  const reopenAt = wink ? 0.59 : 0.42;
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    eyeOpening = previous.map((opening, index) => {
      if (wink && index === 1) return opening + (1 - opening) * ease(progress / closeAt);
      if (progress < closeAt) return opening * (1 - ease(progress / closeAt));
      return ease((progress - reopenAt) / (1 - reopenAt));
    });
    model.setParameter('ParamEyeLOpen', eyeOpening[0]);
    model.setParameter('ParamEyeROpen', eyeOpening[1]);
    view.advance(0);
    if (progress < 1) eyeFrame = requestAnimationFrame(frame);
    else blinkTimer = setTimeout(idleBlink, 3200 + Math.random() * 3500);
  }
  eyeFrame = requestAnimationFrame(frame);
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
api.bounce(() => {
  spring();
  animateEyes(true);
  stopStars?.();
  stopStars = burstStars(starCanvas, prefs.size);
});
api.impact(collision);
api.tilt((angle) => { carrier.style.transform = `rotate(${angle}deg)`; });

let pointer = null;
hitSurface.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || pointer !== null) return;
  pointer = event.pointerId;
  hitSurface.setPointerCapture(pointer);
  api.pointer(event.shiftKey ? 'resize' : 'down');
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
hitSurface.addEventListener('wheel', (event) => {
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  api.wheel(event.deltaY * unit);
}, { passive: false });

async function loadModel() {
  try {
    view = new MochiView(canvas, { autoStart: false, look: 'off', fit: 0.95, maxPixelRatio: 2 });
    model = await view.load('/assets/model/GrokChibi.model3.json');
    for (const effect of ['look', 'eyeBlink', 'breath', 'idle']) model.setEffect(effect, false);
    const render = () => view.advance(0);
    new ResizeObserver(render).observe(canvas);
    render();
    document.body.dataset.model = 'live2d';
    blinkTimer = setTimeout(idleBlink, 2400);
  } catch (error) {
    failure = true;
    console.error('Grok Chibi could not be loaded', error);
    document.getElementById('fallback').hidden = false;
    document.body.dataset.model = 'fallback';
    showStatus();
  }
}

loadModel();
