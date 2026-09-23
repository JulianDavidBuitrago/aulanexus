// Fondo animado: red de partículas conectadas que reacciona al puntero
export function startBackground() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let w, h, dpr, pts = [], raf;
  const mouse = { x: -9999, y: -9999 };

  function colors() {
    const dark = document.documentElement.dataset.theme !== 'light';
    return dark
      ? { dot: [[34, 211, 238], [139, 92, 246], [236, 72, 153]], line: 'rgba(139,92,246,', a: 0.55 }
      : { dot: [[8, 145, 178], [124, 58, 237], [219, 39, 119]], line: 'rgba(124,58,237,', a: 0.35 };
  }
  let pal = colors();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(90, (w * h) / 16000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.6, c: Math.floor(Math.random() * 3)
    }));
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    const maxD = 130;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!reduce) { p.x += p.vx; p.y += p.vy; }
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dxm = p.x - mouse.x, dym = p.y - mouse.y, dm = Math.hypot(dxm, dym);
      if (dm < 140 && !reduce) { p.x += dxm / dm * 0.6; p.y += dym / dm * 0.6; }
      for (let j = i + 1; j < pts.length; j++) {
        const q = pts[j], d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < maxD) {
          ctx.strokeStyle = pal.line + ((1 - d / maxD) * pal.a * 0.5).toFixed(3) + ')';
          ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      const [r, g, b] = pal.dot[p.c];
      ctx.fillStyle = `rgba(${r},${g},${b},${pal.a + 0.2})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  }

  resize(); frame();
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); resize(); frame(); });
  window.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else if (!reduce) { cancelAnimationFrame(raf); frame(); } });
  new MutationObserver(() => { pal = colors(); if (reduce) frame(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
