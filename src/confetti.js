// קונפטי בצבעי המותג לרגע הניצחון
export function confetti(duration = 4500) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let cv = document.getElementById('confetti');
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'confetti'; document.body.appendChild(cv); }
  const c = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const resize = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
  resize();
  const colors = ['#0090FF', '#32C4FF', '#6236FF', '#FFFFFF', '#D09E00'];
  const N = Math.min(220, Math.round(innerWidth / 6));
  const parts = Array.from({ length: N }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.6,
    w: 6 + Math.random() * 8,
    h: 8 + Math.random() * 10,
    vx: -1.5 + Math.random() * 3,
    vy: 2 + Math.random() * 3.5,
    rot: Math.random() * 6.28,
    vr: -0.15 + Math.random() * 0.3,
    col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  function frame(t) {
    const el = t - t0;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, innerWidth, innerHeight);
    const fade = el > duration - 800 ? Math.max(0, (duration - el) / 800) : 1;
    for (const p of parts) {
      p.x += p.vx + Math.sin((el / 400) + p.rot) * 0.6;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > innerHeight + 20 && el < duration - 1500) { p.y = -20; p.x = Math.random() * innerWidth; }
      c.save();
      c.globalAlpha = fade;
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = p.col;
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
      c.restore();
    }
    if (el < duration) requestAnimationFrame(frame);
    else c.clearRect(0, 0, cv.width, cv.height);
  }
  requestAnimationFrame(frame);
}
