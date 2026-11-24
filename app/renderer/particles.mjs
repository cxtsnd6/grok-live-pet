const gold = ['#ffe2a4', '#ffd073', '#fff7ea'];
const rose = ['#ff99ae', '#fa6e94', '#ffc1c9'];
const violet = ['#dfb6ff', '#a995fa', '#eed9ff'];
const themes = {
  pat: { shapes: ['heart', 'heart', 'star'], colors: [...rose, ...gold], count: 11, y: 0.18, gravity: -12 },
  poke: { shapes: ['ring', 'star'], colors: gold, count: 7, y: 0.58, gravity: 32 },
  feed: { shapes: ['crumb', 'crumb', 'star'], colors: gold, count: 15, y: 0.38, gravity: 168 },
  wave: { shapes: ['star', 'star', 'ring'], colors: [...gold, ...violet], count: 11, y: 0.36, x: 0.69, gravity: 45 },
  stretch: { shapes: ['star', 'ring'], colors: [...gold, ...violet], count: 9, y: 0.23, gravity: -9 },
  twirl: { shapes: ['star', 'crumb'], colors: [...rose, ...gold, ...violet], count: 22, y: 0.48, gravity: 42 },
  celebrate: { shapes: ['paper', 'paper', 'star'], colors: [...rose, ...gold, ...violet, '#abe4d0'], count: 42, y: 0.48, gravity: 140 },
  launch: { shapes: ['star', 'ring'], colors: violet, count: 13, y: 0.68, gravity: 18 },
  settle: { shapes: ['crumb', 'ring'], colors: gold, count: 8, y: 0.88, gravity: 50 },
  peek: { shapes: ['star'], colors: gold, count: 6, y: 0.25, gravity: 20 },
  nap: { shapes: ['sleep'], colors: [...violet, ...gold], count: 2, y: 0.11, x: 0.65, gravity: -13 },
  wake: { shapes: ['star', 'ring'], colors: [...gold, ...rose], count: 11, y: 0.2, gravity: 36 },
  waiting: { shapes: ['question', 'star'], colors: gold, count: 5, y: 0.21, gravity: -13 },
  error: { shapes: ['star', 'ring'], colors: [...rose, ...violet], count: 10, y: 0.24, gravity: 52 },
};

const random = (from, to) => from + (to - from) * Math.random();
const choose = (items) => items[Math.floor(Math.random() * items.length)];

export class Particles {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.items = [];
    this.pixelRatio = 1;
    this.resize();
  }

  resize() {
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  burst(action, size) {
    const theme = themes[action];
    if (!theme) return;
    const x = this.width * (theme.x ?? 0.5);
    const y = 62 + size * theme.y;
    const scale = Math.max(0.83, size / 176);
    for (let i = 0; i < theme.count; i++) {
      const shape = choose(theme.shapes);
      const gentle = shape === 'sleep' || shape === 'question';
      const side = action === 'celebrate' ? (i % 2 ? 1 : -1) : 0;
      this.items.push({
        shape, x: x + side * this.width * 0.20 + random(-15, 15), y: y + random(-6, 6),
        vx: side ? side * random(17, 63) + random(-13, 13) : random(-100, 100) * (gentle ? 0.29 : 0.8),
        vy: side ? random(-147, -53) : random(-110, -24) * (gentle ? 0.56 : 1),
        spin: random(-5, 5), angle: random(-0.6, 0.6), age: 0,
        life: gentle ? 1.5 : random(0.48, 1.26),
        delay: i * (gentle ? 0.24 : 0.006),
        radius: random(2.9, 6.2) * scale, color: choose(theme.colors), gravity: theme.gravity,
      });
    }
    if (this.items.length > 120) this.items.splice(0, this.items.length - 120);
  }

  draw(dt, enabled) {
    const ctx = this.context;
    if (!enabled) this.items.length = 0;
    if (this.items.length === 0 && !this.dirty) return;
    ctx.clearRect(0, 0, this.width, this.height);
    this.dirty = this.items.length > 0;
    this.items = this.items.filter((p) => {
      if (p.delay > 0) { p.delay -= dt; return true; }
      p.age += dt;
      if (p.age >= p.life) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.992;
      p.vy += p.gravity * dt;
      const progress = p.age / p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle + p.spin * p.age * 0.55);
      ctx.globalAlpha = Math.min(1, progress * 9, (1 - progress) * 2.7);
      ctx.fillStyle = ctx.strokeStyle = p.color;
      drawShape(ctx, p.shape, p.radius, progress);
      ctx.restore();
      return true;
    });
  }
}

function drawShape(ctx, shape, r, progress) {
  if (shape === 'sleep' || shape === 'question') {
    ctx.font = `700 ${Math.round(r * 2.7)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(shape === 'sleep' ? 'z' : '?', 0, 0);
    return;
  }
  if (shape === 'paper') {
    ctx.fillRect(-r * 0.5, -r * 0.3, r * (0.6 + Math.abs(Math.sin(progress * 9))), r * 0.75);
    return;
  }
  ctx.beginPath();
  if (shape === 'heart') {
    ctx.moveTo(0, r * 0.95);
    ctx.bezierCurveTo(-0.4 * r, r * 0.5, -r * 1.44, -r * 0.1, -r * 0.89, -r * 0.72);
    ctx.bezierCurveTo(-r * 0.67, -r * 1.01, -r * 0.14, -r * 0.88, 0, -r * 0.47);
    ctx.bezierCurveTo(r * 0.14, -r * 0.88, r * 0.67, -r * 1.01, r * 0.89, -r * 0.72);
    ctx.bezierCurveTo(r * 1.44, -r * 0.1, r * 0.4, r * 0.5, 0, r * 0.95);
  } else if (shape === 'star') {
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.16, -r * 0.17, r, 0);
    ctx.quadraticCurveTo(r * 0.16, r * 0.17, 0, r);
    ctx.quadraticCurveTo(-r * 0.16, r * 0.17, -r, 0);
    ctx.quadraticCurveTo(-r * 0.16, -r * 0.17, 0, -r);
  } else if (shape === 'ring') {
    ctx.arc(0, 0, r * (0.48 + progress), 0, Math.PI * 2);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    return;
  } else {
    ctx.ellipse(0, 0, r * 0.44, r * 0.29, 0.5, 0, Math.PI * 2);
  }
  ctx.fill();
}
