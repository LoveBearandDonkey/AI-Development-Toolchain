(() => {
  'use strict';

  // Closed Catmull-Rom contour: matching control points keep the petals soft.
  function flowerPath({ petals, radius, depth }, phase = 0, offset = 0) {
    const count = petals * 8;
    const points = Array.from({ length: count }, (_, i) => {
      const angle = i / count * Math.PI * 2;
      const r = radius + depth * Math.cos(petals * angle) + offset * Math.sin(angle * 3 + phase);
      return [160 + Math.cos(angle) * r, 145 + Math.sin(angle) * r];
    });
    const fmt = point => point.map(v => v.toFixed(2)).join(',');
    let d = `M${fmt(points[0])}`;
    for (let i = 0; i < count; i++) {
      const a = points[(i - 1 + count) % count], b = points[i];
      const c = points[(i + 1) % count], e = points[(i + 2) % count];
      d += `C${fmt(b.map((v, j) => v + (c[j] - a[j]) / 6))} ${fmt(c.map((v, j) => v - (e[j] - b[j]) / 6))} ${fmt(c)}`;
    }
    return d + 'Z';
  }

  // Integrate small substeps so the damped spring is stable at lower frame rates.
  function spring(state, target, response, damping, dt) {
    const steps = Math.max(1, Math.ceil(dt * 120));
    const step = dt / steps;
    const omega = 2 / response;
    for (let i = 0; i < steps; i++) {
      state.velocity += ((target - state.value) * omega * omega - 2 * damping * omega * state.velocity) * step;
      state.value += state.velocity * step;
    }
    return state.value;
  }

  const springState = () => ({ value: 0, velocity: 0 });

  // Project a feature on the rounded front surface, keeping its frontal pose exact.
  function projectFeature(x, y, z, yaw, pitch, perspective) {
    const turnedX = x * Math.cos(yaw) + z * Math.sin(yaw);
    const turnedZ = z * Math.cos(yaw) - x * Math.sin(yaw);
    const turnedY = y * Math.cos(pitch) + turnedZ * Math.sin(pitch);
    const depth = turnedZ * Math.cos(pitch) - y * Math.sin(pitch);
    const scale = perspective / (perspective - (depth - z));
    return { x: turnedX * scale, y: turnedY * scale, scale };
  }

  class CatalogAvatar {
    constructor(root, config) {
      this.root = root;
      this.config = structuredClone(config);
      this.shape = root.querySelector('[data-avatar-shape]');
      this.body = root.querySelector('[data-avatar-body]');
      this.face = root.querySelector('[data-avatar-face]');
      this.eyes = root.querySelectorAll('[data-avatar-eye]');
      this.mouth = root.querySelector('[data-avatar-mouth]');
      this.shadow = root.querySelector('[data-avatar-shadow]');
      this.light = root.querySelector('#avatar-material');
      this.pose = { ...config.states.idle };
      this.gaze = { x: 0, y: 0 };
      this.faceInertia = Object.fromEntries(['float', 'roll', 'yaw', 'pitch', 'squash'].map(key => [key, springState()]));
      const rig = this.config.rig;
      this.features = [...this.eyes, this.mouth].map((element, i) => {
        const x = i === 2 ? 0 : (i ? 1 : -1) * rig.eyeSpacing / 2;
        const y = i === 2 ? rig.mouthY : rig.eyeY;
        return { element, x, y, driftX: springState(), driftY: springState() };
      });
      this.blink = { value: 1 };
      this.time = 0;
      this.expressionElapsed = 0;
      this.nextExpressionAt = this.randomInterval();
      this.autonomous = true;
      this.visible = true;
      this.destroyed = false;
      this.state = 'idle';
      this.media = matchMedia('(prefers-reduced-motion: reduce)');
      this.events = new AbortController();
      const options = { signal: this.events.signal };
      this.tick = this.tick.bind(this);
      this.refresh = this.refresh.bind(this);
      this.onPointer = event => {
        if (event.pointerType === 'touch' || !this.running) return;
        const rect = this.root.getBoundingClientRect();
        this.setGaze((event.clientX - rect.left - rect.width / 2) / (innerWidth / 2), (event.clientY - rect.top - rect.height / 2) / (innerHeight / 2));
      };
      window.addEventListener('pointermove', this.onPointer, { ...options, passive: true });
      document.documentElement.addEventListener('pointerleave', () => this.setGaze(0, 0), options);
      window.addEventListener('blur', () => this.setGaze(0, 0), options);
      document.addEventListener('visibilitychange', this.refresh, options);
      this.media.addEventListener('change', this.refresh, options);
      this.observer = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.refresh(); });
      this.observer.observe(root);

      this.applyMaterial();
      this.shape.setAttribute('d', flowerPath(config.shape));
      // The SVG remains visible if the animation dependency is unavailable.
      if (!window.gsap || !window.MorphSVGPlugin) {
        return;
      }
      gsap.registerPlugin(MorphSVGPlugin);
      gsap.set(this.body, { svgOrigin: '160 145' });
      gsap.set(this.face, { svgOrigin: `${rig.centerX} ${rig.centerY}` });
      this.features.forEach((feature, i) => {
        const x = rig.centerX + feature.x, y = rig.centerY + feature.y;
        if (i !== 2) {
          feature.element.setAttribute('cx', x);
          feature.element.setAttribute('cy', y);
        }
        gsap.set(feature.element, { svgOrigin: `${x} ${y}` });
      });
      gsap.set(this.shadow, { transformOrigin: '50% 50%' });
      this.morph = gsap.timeline({ repeat: -1, paused: true, defaults: { duration: config.motion.floatCycle / 2, ease: 'sine.inOut' } })
        .to(this.shape, { morphSVG: { shape: flowerPath(config.shape, 1.1, config.shape.contourOffset), shapeIndex: 0 } })
        .to(this.shape, { morphSVG: { shape: flowerPath(config.shape, 3.9, config.shape.contourOffset), shapeIndex: 0 } })
        .to(this.shape, { morphSVG: { shape: flowerPath(config.shape), shapeIndex: 0 } });
      this.blinkTimeline = gsap.timeline({ repeat: -1, paused: true })
        .to(this.blink, { value: 0.08, duration: 0.075, delay: 2.7 })
        .to(this.blink, { value: 1, duration: 0.14 })
        .to(this.blink, { value: 0.08, duration: 0.075, delay: 3.4 })
        .to(this.blink, { value: 1, duration: 0.14 });
      this.refresh();
    }

    applyMaterial() {
      for (const [key, color] of Object.entries(this.config.material)) {
        this.root.querySelectorAll(`[data-avatar-color="${key}"]`).forEach(element => {
          element.setAttribute(element.tagName === 'stop' ? 'stop-color' : 'fill', color);
          if (key === 'face') element.style.color = color;
        });
      }
    }

    randomInterval() {
      const { minInterval, maxInterval } = this.config.behavior;
      return minInterval + Math.random() * (maxInterval - minInterval);
    }

    randomExpression() {
      const choices = this.config.behavior.expressions.filter(state => state !== this.state);
      if (!choices.length) return;
      this.setState(choices[Math.floor(Math.random() * choices.length)], true);
    }

    // External business states take control until resumeExpressions() is called.
    setState(state, automatic = false) {
      if (!Object.hasOwn(this.config.states, state)) throw new RangeError(`Unknown avatar state: ${state}`);
      this.state = state;
      this.autonomous = automatic;
      this.expressionElapsed = 0;
      this.nextExpressionAt = state === 'wink' ? 1.1 : this.randomInterval();
      const pose = { ...this.config.states.idle, ...this.config.states[state] };
      if (!window.gsap) return;
      gsap.killTweensOf(this.pose);
      if (this.running) gsap.to(this.pose, { ...pose, duration: 0.65, ease: 'power2.inOut' });
      else Object.assign(this.pose, pose);
    }

    resumeExpressions() {
      this.autonomous = true;
      this.expressionElapsed = 0;
      this.nextExpressionAt = this.randomInterval();
    }

    setGaze(x, y) {
      this.gaze.x = Math.max(-1, Math.min(1, Number(x) || 0));
      this.gaze.y = Math.max(-1, Math.min(1, Number(y) || 0));
    }

    refresh() {
      if (!this.morph || this.destroyed) return;
      this.running = !this.media.matches && this.visible && !document.hidden;
      gsap.ticker.remove(this.tick);
      if (this.running) {
        gsap.to(this.pose, { ...this.config.states.idle, ...this.config.states[this.state], duration: 0.4, overwrite: true });
        this.morph.play();
        this.blinkTimeline.play();
        gsap.ticker.add(this.tick);
      } else {
        this.morph.pause();
        this.blinkTimeline.pause();
        gsap.killTweensOf(this.pose);
        // Never freeze in the middle of a blink.
        gsap.set(this.eyes, { scaleY: 1 });
        if (this.media.matches) {
          this.shape.setAttribute('d', flowerPath(this.config.shape));
          gsap.set([this.body, this.face], { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
          gsap.set([...this.eyes, this.mouth], { x: 0, y: 0, scaleX: 1, scaleY: 1 });
          for (const state of Object.values(this.faceInertia)) { state.value = 0; state.velocity = 0; }
          for (const feature of this.features) {
            for (const key of ['driftX', 'driftY']) { feature[key].value = 0; feature[key].velocity = 0; }
          }
          this.light.setAttribute('cx', '32%');
          this.light.setAttribute('cy', '22%');
          gsap.set(this.shadow, { scaleX: 1, opacity: 0.25 });
          this.renderMouth(this.config.states.idle.smile, this.config.states.idle.mouthWidth, 0);
        }
      }
    }

    tick(_time, delta) {
      const dt = Math.min(delta / 1000, 0.05);
      this.time += dt;
      if (this.autonomous) {
        this.expressionElapsed += dt;
        if (this.expressionElapsed >= this.nextExpressionAt) this.randomExpression();
      }
      const m = this.config.motion;
      const phase = this.time / m.floatCycle * Math.PI * 2;
      const wave = Math.sin(phase), lag = Math.sin(phase - 0.25);
      const amplitude = this.pose.energy;
      const d = this.config.depth;
      const turn = this.time / d.turnCycle * Math.PI * 2;
      const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
      // Autonomous head turns keep the volume readable even without mouse input.
      const yaw = clamp(Math.sin(turn) * d.idleYaw + this.gaze.x * d.gazeYaw + this.pose.lookX * 0.3, d.maxYaw);
      const pitch = clamp(Math.sin(turn * 0.73) * d.idlePitch + this.gaze.y * d.gazePitch + this.pose.lookY * 0.2, d.maxPitch);
      const squash = Math.sin(phase + 0.6) * m.breathScale * amplitude;
      const float = wave * m.floatDistance * amplitude;
      const roll = lag * m.headRotation + this.pose.tilt;
      gsap.set(this.body, {
        y: float, rotation: roll,
        scaleX: (1 + squash) * Math.cos(yaw * 0.55),
        scaleY: (1 - squash * 0.7) * Math.cos(pitch * 0.45)
      });
      // The face is a sibling of the silhouette: it can lag behind its roll/bounce.
      gsap.set(this.face, {
        y: spring(this.faceInertia.float, float, m.faceLag, d.damping, dt),
        rotation: spring(this.faceInertia.roll, roll, m.faceLag * 1.1, d.damping, dt)
      });
      // One shared pose and deformation field preserve the eye/mouth geometry.
      const faceYaw = spring(this.faceInertia.yaw, yaw, m.faceLag, d.damping, dt);
      const facePitch = spring(this.faceInertia.pitch, pitch, m.faceLag, d.damping, dt);
      const compression = spring(this.faceInertia.squash, squash, m.faceLag, d.damping, dt) * d.squashFollow;
      const rig = this.config.rig;
      this.features.forEach((feature, i) => {
        const isMouth = i === 2;
        const response = m.faceLag * (isMouth ? d.mouthLag : d.eyeLag);
        const limit = isMouth ? rig.maxMouthDrift : rig.maxEyeDrift;
        // Soft-tissue slip is bounded in local face coordinates; it never turns a feature independently.
        const targetX = clamp(-this.faceInertia.yaw.velocity * (isMouth ? 0.55 : 0.25) + (isMouth ? 0 : this.gaze.x * 0.7), limit);
        const targetY = clamp(-this.faceInertia.pitch.velocity * (isMouth ? 0.55 : 0.25) + (isMouth ? 0 : this.gaze.y * 0.7), limit);
        const slipX = clamp(spring(feature.driftX, targetX, response, d.damping, dt), limit);
        const slipY = clamp(spring(feature.driftY, targetY, response, d.damping, dt), limit);
        const localX = feature.x * (1 + compression) + slipX;
        const localY = feature.y * (1 - compression * 0.7) + slipY;
        const surfaceZ = rig.surfaceDepth - rig.surfaceRadius + Math.sqrt(rig.surfaceRadius ** 2 - localX * localX - localY * localY);
        const position = projectFeature(localX, localY, surfaceZ, faceYaw, facePitch, d.perspective);
        const blink = isMouth ? 1 : this.blink.value * this.pose.eyes * (i ? this.pose.rightEye : this.pose.leftEye);
        gsap.set(feature.element, {
          x: position.x - feature.x, y: position.y - feature.y,
          scaleX: Math.cos(faceYaw) * position.scale * (1 + compression),
          scaleY: Math.cos(facePitch) * position.scale * (1 - compression * 0.7) * blink
        });
      });
      this.light.setAttribute('cx', `${32 - yaw * 16}%`);
      this.light.setAttribute('cy', `${22 - pitch * 16}%`);
      gsap.set(this.shadow, { scaleX: 1 - wave * 0.08, opacity: 0.24 - wave * 0.05 });
      const smile = this.pose.smile + (this.state === 'speaking' ? Math.sin(this.time * 14) * 5 : 0);
      this.renderMouth(smile, this.pose.mouthWidth, this.pose.mouthOpen);
    }

    renderMouth(smile, width, open) {
      const x = this.config.rig.centerX, y = this.config.rig.centerY + this.config.rig.mouthY;
      this.mouth.setAttribute('d', `M${x - width} ${y} Q${x} ${y + smile * 2 - open} ${x + width} ${y} Q${x} ${y + smile * 2 + open} ${x - width} ${y}Z`);
      this.mouth.setAttribute('fill', this.config.material.face);
      this.mouth.setAttribute('fill-opacity', Math.min(1, open / 4));
    }

    destroy() {
      this.destroyed = true;
      this.running = false;
      this.events.abort();
      this.observer.disconnect();
      if (window.gsap) {
        gsap.ticker.remove(this.tick);
        gsap.killTweensOf(this.pose);
      }
      this.morph?.kill();
      this.blinkTimeline?.kill();
    }
  }

  const root = document.querySelector('[data-catalog-avatar]');
  if (root) window.catalogAvatar = new CatalogAvatar(root, window.CATALOG_AVATAR_CONFIG);
})();
