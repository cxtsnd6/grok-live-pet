const sparks = [
  { dx: -0.18, dy: -0.11, radius: 0.025, delay: 0, life: 610, color: '#ffd482', tips: 4 },
  { dx: -0.11, dy: -0.22, radius: 0.017, delay: 28, life: 680, color: '#fff2bf', tips: 4 },
  { dx: -0.22, dy: 0.022, radius: 0.013, delay: 68, life: 590, color: '#e4b5ef', tips: 4 },
  { dx: -0.064, dy: -0.28, radius: 0.021, delay: 78, life: 545, color: '#ffe7a7', tips: 5 },
  { dx: -0.20, dy: -0.20, radius: 0.011, delay: 93, life: 565, color: '#ffffff', tips: 4 },
  { dx: -0.12, dy: 0.076, radius: 0.016, delay: 111, life: 500, color: '#ffdcb0', tips: 4 },
  { dx: -0.016, dy: -0.19, radius: 0.013, delay: 135, life: 505, color: '#f4cbed', tips: 4 },
  { dx: -0.25, dy: -0.07, radius: 0.012, delay: 158, life: 465, color: '#ffe5ac', tips: 4 },
];

function star(ctx, radius, tips) {
  const inner = tips === 5 ? 0.48 : 0.28;
  ctx.beginPath();
  for (let i = 0; i < tips * 2; i++) {
    const angle = (i / tips - 0.5) * Math.PI;
    const edge = radius * (i % 2 ? inner : 1);
    const x = Math.cos(angle) * edge;
    const y = Math.sin(angle) * edge;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

export function burstStars(canvas, size) {
  const ctx = canvas.getContext('2d');
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const center = { x: width / 2 - size * 0.22, y: 62 + size * 0.27 };
  const start = performance.now();
  let frame;

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    for (const [index, spark] of sparks.entries()) {
      const progress = (now - start - spark.delay) / spark.life;
      if (progress <= 0 || progress >= 1) continue;
      const spread = 1 - (1 - progress) ** 3;
      const x = center.x + spark.dx * size * spread;
      const y = center.y + size * (spark.dy * spread + progress ** 2 * 0.038);
      const radius = Math.max(1.6, spark.radius * size) * (0.55 + spread * 0.6);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((index % 2 ? 1 : -1) * (0.1 + progress * 0.42));
      ctx.globalAlpha = Math.min(1, progress * 12) * (1 - progress) ** 0.75;
      ctx.strokeStyle = '#a36a53';
      ctx.lineWidth = Math.max(0.65, size * 0.0025);
      ctx.fillStyle = spark.color;
      star(ctx, radius, spark.tips);
      ctx.restore();
    }
    if (now - start < 735) frame = requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, width, height);
  }

  frame = requestAnimationFrame(draw);
  return () => { cancelAnimationFrame(frame); ctx.clearRect(0, 0, width, height); };
}
