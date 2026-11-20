// Cursor-directed edge lighting, inspired by React Bits Border Glow.
// https://reactbits.dev/components/border-glow
(() => {
  const grid = document.getElementById('grid');
  if (!grid) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const responseRange = 96;
  let activeCards = new Set();
  let point = null;
  let frame = 0;

  function clearGlow() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    point = null;
    activeCards.forEach(card => card.style.removeProperty('--glow-opacity'));
    activeCards.clear();
  }

  function paintGlow() {
    frame = 0;
    if (!point) return;
    const nearbyCards = new Set();
    grid.querySelectorAll('.launch-card').forEach(card => {
      const bounds = card.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const outsideX = Math.max(bounds.left - point.x, 0, point.x - bounds.right);
      const outsideY = Math.max(bounds.top - point.y, 0, point.y - bounds.bottom);
      const outsideDistance = Math.hypot(outsideX, outsideY);
      if (outsideDistance >= responseRange) return;

      const x = Math.max(0, Math.min(bounds.width, point.x - bounds.left));
      const y = Math.max(0, Math.min(bounds.height, point.y - bounds.top));
      const distance = Math.max(
        Math.abs(x / bounds.width - .5) * 2,
        Math.abs(y / bounds.height - .5) * 2
      );
      const intensity = Math.pow(Math.max(0, (distance - .12) / .88), .85)
        * (1 - outsideDistance / responseRange);

      card.style.setProperty('--glow-x', `${x.toFixed(1)}px`);
      card.style.setProperty('--glow-y', `${y.toFixed(1)}px`);
      card.style.setProperty('--glow-opacity', intensity.toFixed(3));
      nearbyCards.add(card);
    });
    activeCards.forEach(card => {
      if (!nearbyCards.has(card)) card.style.removeProperty('--glow-opacity');
    });
    activeCards = nearbyCards;
  }

  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || motion.matches) {
      clearGlow();
      return;
    }
    point = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(paintGlow);
  }, { passive: true });

  document.addEventListener('pointerout', event => {
    if (!event.relatedTarget) clearGlow();
  }, { passive: true });
  document.addEventListener('pointercancel', clearGlow, { passive: true });
  window.addEventListener('blur', clearGlow);
  window.addEventListener('resize', clearGlow, { passive: true });
  window.addEventListener('scroll', clearGlow, { passive: true });
  motion.addEventListener('change', clearGlow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearGlow();
  });
})();
