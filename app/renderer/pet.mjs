import { MochiView } from '/third_party/mochi2d.mjs';
import { statusLabels } from '/app/behavior.mjs';
import { applyAction, applyParameters, basePose, durations } from './motions.mjs';
import { Particles } from './particles.mjs';

const canvas = document.getElementById('model');
const figure = document.getElementById('figure');
const hitSurface = document.getElementById('pet');
const statusBadge = document.getElementById('status');
const statusText = document.getElementById('status-text');
const statusCount = document.getElementById('status-count');
const particles = new Particles(document.getElementById('particles'));
const api = window.grokPet;

let prefs = { size: 176, effects: true, bubble: true };
let frame = { x: 0, y: 0, moving: 0, peek: 0, flight: 0, drag: false, air: false, sleeping: false };
let status = { phase: 'idle', at: 0, count: 0 };
let action = null;
let view = null;
let model = null;
let failure = false;
let previous = performance.now();
let nextBlink = previous + 2300;
let nextSleep = 0;
let lastEffect = null;
const gaze = { x: 0, y: 0 };

function showStatus() {
  const phase = failure && !statusLabels[status.phase] ? 'unavailable' : status.phase;
  statusBadge.hidden = !prefs.bubble || phase === 'idle';
  statusBadge.dataset.phase = phase;
  statusText.textContent = phase === 'unavailable' ? '静态预览' : statusLabels[phase] ?? '';
  statusCount.hidden = status.count < 2;
  statusCount.textContent = status.count >= 2 ? `· ${status.count} 会话` : '';
}

function animate(name) {
  const now = performance.now();
  if (durations[name]) action = { name, start: now, duration: durations[name] };
  if (prefs.effects) particles.burst(name, prefs.size);
  if (name === 'nap') nextSleep = now + 1850;
}

api.settings((next) => {
  prefs = next;
  document.documentElement.style.setProperty('--size', `${prefs.size}px`);
  particles.resize();
  showStatus();
});
api.status((next) => {
  status = next;
  showStatus();
  const effect = { done: 'celebrate', error: 'error', waiting: 'waiting' }[next.phase];
  if (effect && lastEffect !== `${next.phase}-${next.at}`) {
    lastEffect = `${next.phase}-${next.at}`;
    animate(effect);
  }
});
api.frame((next) => { frame = next; });
api.action(animate);
window.addEventListener('resize', () => particles.resize());

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
    model = await view.load('/assets/model/GrokChibi.model3.json');
    for (const effect of ['look', 'eyeBlink', 'breath', 'idle']) model.setEffect(effect, false);
    view.advance(0);
    document.body.dataset.model = 'live2d';
  } catch (error) {
    failure = true;
    console.error('Grok Chibi could not be loaded', error);
    document.getElementById('fallback').hidden = false;
    document.body.dataset.model = 'fallback';
    showStatus();
  }
}

function draw(now) {
  requestAnimationFrame(draw);
  const elapsed = now - previous;
  if (elapsed < 31) return;
  previous = now;
  const dt = Math.min(elapsed / 1000, 0.067);

  if (nextBlink < now - 180) nextBlink = now + 2200 + Math.random() * 3500;
  const blinkTime = now - nextBlink;
  const blink = blinkTime >= 0 ? 1 - Math.sin(Math.PI * Math.min(1, blinkTime / 180)) ** 2 : 1;
  gaze.x += (frame.x - gaze.x) * 0.21;
  gaze.y += (frame.y - gaze.y) * 0.21;
  const pose = basePose(now / 1000, gaze, frame, status.phase, blink);
  if (action) {
    const progress = (now - action.start) / action.duration;
    if (progress < 1) applyAction(pose, action.name, Math.max(0, progress));
    else action = null;
  }
  if (frame.sleeping && now > nextSleep) {
    if (prefs.effects) particles.burst('nap', prefs.size);
    nextSleep = now + 2850;
  }

  hitSurface.dataset.dragging = frame.drag;
  figure.style.transform = `translate(${pose.x}px, ${pose.y}px) rotate(${pose.angle}deg) scale(${pose.scaleX}, ${pose.scaleY})`;
  if (model) {
    applyParameters(model, pose);
    view.advance(dt);
  }
  particles.draw(dt, prefs.effects);
}

loadModel();
requestAnimationFrame(draw);
