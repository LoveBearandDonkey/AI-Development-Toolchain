(() => {
  'use strict';

  const config = window.CATALOG_AVATAR_CONFIG;
  const { headTurn } = config;
  const { TimelineAvatarBody, mountBodyCanvas, mountAvatarArms, setFacePlane, createAvatarFacePart } = window.TimelineAvatarBody;
  const body = new TimelineAvatarBody(config);
  const hands = [-1, 1].map(side => ({ side, x: config.rig.centerX + side * 108, y: config.rig.centerY + 60 }));
  const cards = new Map([...document.querySelectorAll('.face-toggle svg')].map((art, index) => {
    const bodyLayer = art.querySelector('[data-timeline-preview-body]');
    const { canvas } = mountBodyCanvas(bodyLayer, config.rig);
    const expression = window.CATALOG_MATH_EXPRESSIONS?.[index];
    if (expression) art.querySelector('.math-feature .face-features').replaceChildren(...expression.parts.map(createAvatarFacePart));
    const backArms = document.createElementNS(art.namespaceURI, 'g');
    const frontArms = document.createElementNS(art.namespaceURI, 'g');
    bodyLayer.before(backArms);
    bodyLayer.after(frontArms);
    return [art, {
      canvas, context: canvas.getContext('2d'), face: art.querySelector('[data-timeline-preview-face]'),
      paintArm: mountAvatarArms(backArms, frontArms),
    }];
  }));
  const visible = new Set();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const frameInterval = 32;
  let pendingFrame;
  let lastFrame;
  let motionTime = 0;

  function paint(targets) {
    const plane = body.facePlane();
    const shoulders = hands.map(({ side }) => body.armAttachment(side));
    for (const art of targets) {
      const { canvas, context, face, paintArm } = cards.get(art);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(body.canvas, 0, 0);
      setFacePlane(face, plane);
      hands.forEach((hand, index) => paintArm(hand.side, shoulders[index], hand));
    }
  }

  function headTurnDirection(time) {
    let direction = 0;
    for (const step of headTurn.steps) {
      if (time < step.start) break;
      const progress = Math.min(1, (time - step.start) / step.duration);
      const eased = (1 - Math.cos(progress * Math.PI)) / 2;
      direction += (step.direction - direction) * eased;
    }
    return direction;
  }

  function tick(timestamp) {
    lastFrame ??= timestamp;
    const delta = timestamp - lastFrame;
    if (delta >= frameInterval) {
      const step = Math.min(delta, 50);
      lastFrame = timestamp;
      motionTime += delta;
      const turn = headTurnDirection(motionTime / 1000 % config.depth.turnCycle);
      body.advance(step);
      body.render(headTurn.yaw * turn, headTurn.pitch * turn);
      paint(visible);
    }
    pendingFrame = requestAnimationFrame(tick);
  }

  function refresh() {
    if (!media.matches && !document.hidden && visible.size > 0) {
      pendingFrame ??= requestAnimationFrame(tick);
      return;
    }
    cancelAnimationFrame(pendingFrame);
    pendingFrame = undefined;
    lastFrame = undefined;
    if (media.matches) {
      body.render();
      paint(cards.keys());
    }
  }

  if (media.matches) body.render();
  else body.render(0, 0);
  paint(cards.keys());
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting) visible.add(target);
      else visible.delete(target);
    }
    refresh();
  });
  cards.forEach((_card, art) => observer.observe(art));
  media.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
})();
