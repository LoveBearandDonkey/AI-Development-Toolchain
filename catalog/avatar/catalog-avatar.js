(() => {
  'use strict';

  const { TimelineAvatarBody, mountBodyCanvas, setFacePlane, createAvatarFacePart } = window.TimelineAvatarBody;
  const { sweepDuration } = window.RoundedBlock;

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

  class CatalogAvatar {
    constructor(root, config) {
      this.root = root;
      this.config = structuredClone(config);
      this.body = root.querySelector('[data-avatar-body]');
      this.face = root.querySelector('[data-avatar-face]');
      this.eyes = root.querySelectorAll('[data-avatar-eye]');
      this.mouth = root.querySelector('[data-avatar-mouth]');
      this.shadow = root.querySelector('[data-avatar-shadow]');
      this.pose = { ...config.states.idle };
      this.gaze = { x: 0, y: 0 };
      this.sceneGazeControlled = false;
      this.sceneTurn = { yaw: 0, pitch: 0, weight: 0 };
      this.bodyTurn = { yaw: springState(), pitch: springState() };
      this.referenceParts = [];
      this.facePlane = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      const rig = this.config.rig;
      this.timelineBody = new TimelineAvatarBody(this.config, mountBodyCanvas(this.body, rig, true));
      this.features = [...this.eyes, this.mouth].map((element, i) => {
        const x = i === 2 ? 0 : (i ? 1 : -1) * rig.eyeSpacing / 2;
        const y = i === 2 ? rig.mouthY : rig.eyeY;
        return { element, x, y };
      });
      this.featurePoses = {};
      this.bodyPose = { yaw: 0, pitch: 0, roll: 0, float: 0, scaleX: 1, scaleY: 1 };
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
        if (event.pointerType === 'touch' || !this.running || this.sceneGazeControlled) return;
        const rect = this.root.getBoundingClientRect();
        this.setGaze((event.clientX - rect.left - rect.width / 2) / (innerWidth / 2), (event.clientY - rect.top - rect.height / 2) / (innerHeight / 2));
      };
      window.addEventListener('pointermove', this.onPointer, { ...options, passive: true });
      const releasePointerGaze = () => { if (!this.sceneGazeControlled) this.setGaze(0, 0); };
      document.documentElement.addEventListener('pointerleave', releasePointerGaze, options);
      window.addEventListener('blur', releasePointerGaze, options);
      document.addEventListener('visibilitychange', this.refresh, options);
      this.media.addEventListener('change', this.refresh, options);
      this.observer = new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.refresh(); });
      this.observer.observe(root);

      this.applyMaterial();
      this.timelineBody.render();
      this.updateFacePlane();
      const stage = root.querySelector('.catalog-avatar-stage');
      const updateResolution = () => {
        const pixels = stage.clientWidth * devicePixelRatio;
        if (pixels > 0) this.timelineBody.setPixelWidth(pixels);
      };
      const watchPixelRatio = () => {
        matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => {
          updateResolution();
          watchPixelRatio();
        }, { ...options, once: true });
      };
      this.resolutionObserver = new ResizeObserver(updateResolution);
      this.resolutionObserver.observe(stage);
      watchPixelRatio();
      if (!window.gsap) return;

      gsap.set(this.body, { svgOrigin: `${rig.centerX} ${rig.centerY}` });
      this.features.forEach((feature, i) => {
        const x = rig.centerX + feature.x, y = rig.centerY + feature.y;
        if (i !== 2) {
          feature.element.setAttribute('cx', x);
          feature.element.setAttribute('cy', y);
        }
        gsap.set(feature.element, { svgOrigin: `${x} ${y}` });
      });
      gsap.set(this.shadow, { transformOrigin: '50% 50%' });
      this.blinkTimeline = gsap.timeline({ repeat: -1, repeatRefresh: true, paused: true })
        .to(this.blink, { value: 0.08, duration: 0.075, delay: () => 2.6 + Math.random() * 2.2 })
        .to(this.blink, { value: 1, duration: 0.14 });
      this.refresh();
    }

    applyMaterial() {
      this.face.setAttribute('fill', this.config.material.face);
      this.face.style.color = this.config.material.face;
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

    // Choreography owns gaze during a performance; mouse events must not write
    // a different pose between animation frames. No arguments returns control.
    setSceneGaze(x, y) {
      this.sceneGazeControlled = Number.isFinite(x) && Number.isFinite(y);
      if (this.sceneGazeControlled) this.setGaze(x, y);
    }

    // A deliberate head turn blends out idle/gaze motion so it cannot cancel
    // the requested direction during a short expression presentation.
    setSceneTurn(yaw = 0, pitch = 0, weight = 0) {
      this.sceneTurn.yaw = Number.isFinite(yaw) ? yaw : 0;
      this.sceneTurn.pitch = Number.isFinite(pitch) ? pitch : 0;
      this.sceneTurn.weight = Math.max(0, Math.min(1, weight || 0));
    }

    setScenePaused(paused) {
      if (this.scenePaused === paused) return;
      this.scenePaused = paused;
      this.refresh();
    }

    getEyeBlink() { return this.blinkSuppressed ? 1 : this.blink.value; }

    updateFacePlane() {
      this.facePlane = this.timelineBody.facePlane(this.bodyPose);
      setFacePlane(this.face, this.facePlane);
    }

    getFacePoint(x, y) {
      const { a, b, c, d, e, f } = this.facePlane;
      const scaleX = Math.hypot(a, b), determinant = a * d - b * c;
      return {
        x: a * x + c * y + e, y: b * x + d * y + f,
        rotation: Math.atan2(b, a) * 180 / Math.PI,
        scaleX, scaleY: determinant / scaleX,
        skewX: Math.atan2(a * c + b * d, determinant) * 180 / Math.PI
      };
    }

    setReferenceFace(expression) {
      if (this.referenceExpression === expression) return;
      this.referenceExpression = expression;
      this.referenceParts.forEach(part => part.element.remove());
      this.referenceParts = (expression?.parts || []).map(part => {
        const element = createAvatarFacePart(part);
        this.face.append(element);
        return { ...part, element };
      });
      this.renderReferenceFace();
    }

    renderReferenceFace() {
      this.referenceParts.forEach(part => {
        const eye = ['leftEye','rightEye'].includes(part.key);
        const blink = eye && this.referenceExpression.blinkEyes !== false ? this.getEyeBlink() : 1;
        part.element.setAttribute('transform', `translate(${part.x} ${part.y}) scale(1 ${blink})`);
      });
    }

    // Scene props use the same projected sockets as the animated facial features.
    // Coordinates are in the avatar SVG, before the scene's outer transform.
    getFeaturePose(name = 'mouth') {
      const index = { leftEye: 0, rightEye: 1, mouth: 2 }[name] ?? 2;
      const feature = this.features[index];
      return this.featurePoses[name] ||
        this.getFacePoint(this.config.rig.centerX + feature.x, this.config.rig.centerY + feature.y);
    }

    getBodyAttachment(side) {
      return this.timelineBody.armAttachment(side, this.bodyPose);
    }

    getBodyTop(sceneRoll) {
      const { roll, float, scaleX, scaleY } = this.bodyPose;
      const { extentX, extentY } = this.timelineBody.projection;
      const angle = sceneRoll + roll * Math.PI / 180;
      return float * Math.cos(sceneRoll) - Math.abs(Math.sin(angle)) * extentX * scaleX
        - Math.abs(Math.cos(angle)) * extentY * scaleY;
    }

    refresh() {
      if (!this.blinkTimeline || this.destroyed) return;
      const visible = this.visible && !document.hidden;
      const reduced = this.media.matches;
      const running = visible && !reduced && !this.scenePaused;
      if (this.running === running && this.reduced === reduced) return;

      this.running = running;
      this.reduced = reduced;
      if (this.running) {
        gsap.to(this.pose, { ...this.config.states.idle, ...this.config.states[this.state], duration: 0.4, overwrite: true });
        this.blinkTimeline.play();
        this.lastFrame = performance.now();
        this.frame = requestAnimationFrame(this.tick);
      } else {
        cancelAnimationFrame(this.frame);
        this.blinkTimeline.pause();
        gsap.killTweensOf(this.pose);
        // Never freeze in the middle of a blink.
        gsap.set(this.eyes, { scaleX: 1, scaleY: 1 });
        if (reduced) {
          this.finishColorSweep();
          this.featurePoses = {};
          Object.assign(this.bodyPose, { yaw: 0, pitch: 0, roll: 0, float: 0, scaleX: 1, scaleY: 1 });
          this.timelineBody.render();
          gsap.set(this.body, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
          this.updateFacePlane();
          gsap.set([...this.eyes, this.mouth], { x: 0, y: 0, scaleX: 1, scaleY: 1 });
          for (const state of Object.values(this.bodyTurn)) { state.value = 0; state.velocity = 0; }
          this.renderReferenceFace();
          gsap.set(this.shadow, { scaleX: 1, opacity: 0.25 });
          this.renderMouth(this.config.states.idle.smile, this.config.states.idle.mouthWidth, 0);
        }
      }
    }

    startColorSweep() {
      this.finishColorSweep();
      this.colorSweepStartedAt = performance.now();
    }

    finishColorSweep() {
      if (this.colorSweepStartedAt === undefined) return;
      this.timelineBody.nextSegment();
      this.colorSweepStartedAt = undefined;
    }

    tick(timestamp) {
      const delta = Math.max(0, timestamp - this.lastFrame);
      this.lastFrame = timestamp;
      const dt = Math.min(delta / 1000, 0.05);
      this.time += delta / 1000;
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
      const idleYaw = Math.sin(turn) * d.idleYaw + this.gaze.x * d.gazeYaw + this.pose.lookX * 0.3;
      const idlePitch = Math.sin(turn * 0.73) * d.idlePitch + this.gaze.y * d.gazePitch + this.pose.lookY * 0.2;
      const { yaw: sceneYaw, pitch: scenePitch, weight } = this.sceneTurn;
      const targetYaw = clamp(idleYaw * (1 - weight) + sceneYaw * weight, d.maxYaw);
      const targetPitch = clamp(idlePitch * (1 - weight) + scenePitch * weight, d.maxPitch);
      // Critically damped turns carry the body and shoulders together, with no
      // oscillation or separate arm lag that could pull a joint off the body.
      const yaw = spring(this.bodyTurn.yaw, targetYaw, .10, 1, dt);
      const pitch = spring(this.bodyTurn.pitch, targetPitch, .10, 1, dt);
      const squash = Math.sin(phase + 0.6) * m.breathScale * amplitude;
      const float = wave * m.floatDistance * amplitude;
      const roll = lag * m.headRotation + this.pose.tilt;
      Object.assign(this.bodyPose, {
        yaw, pitch, roll, float,
        scaleX: (1 + squash) * Math.cos(yaw * d.bodyYawFollow),
        scaleY: (1 - squash * 0.7) * Math.cos(pitch * d.bodyPitchFollow)
      });
      gsap.set(this.body, {
        y: float, rotation: roll,
        scaleX: this.bodyPose.scaleX,
        scaleY: this.bodyPose.scaleY
      });
      if (this.colorSweepStartedAt !== undefined) {
        const progress = (timestamp - this.colorSweepStartedAt) / sweepDuration;
        if (progress >= 1) this.finishColorSweep();
        else this.timelineBody.sweep.progress = Math.max(0, progress);
      }
      this.timelineBody.render(yaw, pitch);
      this.updateFacePlane();
      const rig = this.config.rig;
      this.features.forEach((feature, i) => {
        const isMouth = i === 2;
        this.featurePoses[['leftEye', 'rightEye', 'mouth'][i]] =
          this.getFacePoint(rig.centerX + feature.x, rig.centerY + feature.y);
        if (isMouth) return;
        const openness = this.pose.eyes * (i ? this.pose.rightEye : this.pose.leftEye);
        // Wide eyes grow evenly; squinting and blinking only reduce height.
        gsap.set(feature.element, { scaleX: Math.max(1, openness), scaleY: openness * this.getEyeBlink() });
      });
      gsap.set(this.shadow, { scaleX: 1 - wave * 0.08, opacity: 0.24 - wave * 0.05 });
      const smile = this.pose.smile + (this.state === 'speaking' ? Math.sin(this.time * 14) * 5 : 0);
      this.renderMouth(smile, this.pose.mouthWidth, this.pose.mouthOpen);
      this.renderReferenceFace();
      this.frame = requestAnimationFrame(this.tick);
    }

    renderMouth(smile, width, open) {
      const x = this.config.rig.centerX, y = this.config.rig.centerY + this.config.rig.mouthY;
      const arcTo = (depth, direction) => {
        const end = `${x + direction * width} ${y}`;
        const height = Math.abs(depth);
        if (height < 0.01) return `L${end}`;
        // The half-chord and its midpoint depth determine the circle.
        const radius = (width ** 2 + height ** 2) / (2 * height);
        const largeArc = height > width ? 1 : 0;
        const sweep = depth * direction < 0 ? 1 : 0;
        return `A${radius} ${radius} 0 ${largeArc} ${sweep} ${end}`;
      };
      let path = `M${x - width} ${y} ${arcTo(smile - open / 2, 1)}`;
      if (open > 0) path += ` ${arcTo(smile + open / 2, -1)}Z`;
      this.mouth.setAttribute('d', path);
      this.mouth.setAttribute('fill', this.config.material.face);
      this.mouth.setAttribute('fill-opacity', Math.min(1, open / 4));
    }

    destroy() {
      this.destroyed = true;
      this.running = false;
      this.events.abort();
      this.observer.disconnect();
      this.resolutionObserver.disconnect();
      cancelAnimationFrame(this.frame);
      if (window.gsap) {
        gsap.killTweensOf(this.pose);
      }
      this.blinkTimeline?.kill();
    }
  }

  const root = document.querySelector('[data-catalog-avatar]');
  if (root) window.catalogAvatar = new CatalogAvatar(root, window.CATALOG_AVATAR_CONFIG);
})();
