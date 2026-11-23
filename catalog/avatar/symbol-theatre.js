(() => {
  'use strict';

  const avatar = window.catalogAvatar;
  const list = document.getElementById('categoryList');
  if (!avatar || !list || !window.gsap || !window.CATALOG_MATH_EXPRESSIONS || !window.CATALOG_TRANSITION_LINES?.length) return;

  const NS = 'http://www.w3.org/2000/svg';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const radians = n => n * Math.PI / 180;
  const point = (x, y) => ({ x, y });
  const transitionLines = window.CATALOG_TRANSITION_LINES;
  const spring = () => ({ x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0 });
  function stepSpring(s, dt) {
    const count = Math.ceil(dt * 120), step = dt / count;
    for (let i = 0; i < count; i++) {
      for (const key of ['x', 'y', 'r']) {
        const v = 'v' + key;
        s[v] += (-105 * s[key] - 13 * s[v]) * step;
        s[key] += s[v] * step;
      }
    }
  }
  function svg(tag, attributes = {}) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  class SymbolTheatre {
    constructor() {
      this.root = list.parentElement;
      this.root.classList.add('symbol-theatre');
      this.intro = this.root.closest('.catalog-intro');
      this.intro.classList.add('has-symbol-theatre');
      this.root.dataset.phase = 'idle';
      this.avatar = avatar;
      this.originalParent = avatar.root.parentElement;
      this.originalNext = avatar.root.nextSibling;
      this.originalLabel = avatar.root.getAttribute('aria-label');
      avatar.root.setAttribute('aria-label', '在分类间翻找数学符号、变换表情的蓝色花瓣吉祥物');
      this.avatarLink = document.createElement('a');
      this.avatarLink.className = 'theatre-avatar-link';
      this.avatarLink.href = 'math-symbols.html';
      this.avatarLink.target = '_blank';
      this.avatarLink.rel = 'noreferrer';
      this.avatarLink.setAttribute('aria-label', '小算子的数学符号表情，在新标签页打开');
      this.avatarLink.append(avatar.root);
      this.root.prepend(this.avatarLink);
      this.speech = document.createElement('p');
      this.speech.className = 'theatre-speech';
      this.speech.setAttribute('aria-hidden', 'true');
      this.root.append(this.speech);
      this.speechMode = null;
      this.layers = {};
      for (const depth of ['back', 'front']) {
        const layer = document.createElement('div');
        layer.className = `theatre-layer theatre-layer--${depth}`;
        layer.setAttribute('aria-hidden', 'true');
        this.root.append(layer);
        this.layers[depth] = layer;
      }
      const armLayer = svg('svg', { class: 'theatre-arms', 'aria-hidden': 'true' });
      this.root.append(armLayer);
      this.arms = ['left', 'right'].map(() => {
        const arm = svg('path', { class: 'theatre-arm' });
        armLayer.append(arm);
        return { arm };
      });
      const definitions = [
        ['nabla', '#d9c5f6', -25, 36, -18],
        ['sigma', '#bcebd5', 20, -42, 16],
        ['root', '#ffe0a6', -32, 30, -32],
        ['sum', '#a8c8fb', 32, -32, -19],
        ['dot', '#ffc8d6', -36, 42, 20],
        ['partial', '#c0d2ef', 38, -48, -16],
        ['theta', '#d9c5f6', -30, 47, 28],
        ['times', '#bcebd5', 46, -30, -26],
        ['transpose', '#ffe0a6', 20, 42, 17],
        ['exp', '#ffc8d6', -36, -30, -16]
      ];
      this.glyphs = [];
      this.episodes = window.CATALOG_MATH_EXPRESSIONS.map(reference => {
        const [kind, color, rx, ry, rz] = definitions.find(d => d[0] === reference.symbol);
        const episode = { ...reference, props: [] };
        reference.parts.filter(part => part.prop).forEach((part, index) => {
          const element = document.createElement('span');
          element.className = 'theatre-glyph';
          element.dataset.symbol = kind;
          element.dataset.facePart = part.key;
          const artwork = `<g class="avatar-reference-ink" transform="translate(${-part.x} ${-part.y})">${part.art}</g>`;
          element.innerHTML = `<svg viewBox="-28 -28 56 56"><g data-glyph-ink><g class="theatre-glyph-edge" transform="translate(1.6 2.2)">${artwork}</g>${artwork}</g></svg>`;
          this.layers.back.append(element);
          const glyph = { kind, color, rgb: color.match(/\w\w/g).map(v => parseInt(v, 16)), element, part, ink: element.querySelector('[data-glyph-ink]'),
            rx, ry, rz, owner: 'pile', nudge: spring(), index, mix: 0, front: false,
            pileScale: { partial: 1.35, exp: .8 }[kind] || .95 };
          episode.props.push(glyph); this.glyphs.push(glyph);
        });
        return episode;
      });
      this.media = matchMedia('(prefers-reduced-motion: reduce)');
      this.events = new AbortController();
      this.visible = true;
      this.elapsed = 0;
      this.tick = this.tick.bind(this);
      this.measure = this.measure.bind(this);
      this.refresh = this.refresh.bind(this);
      const options = { signal: this.events.signal };
      document.addEventListener('visibilitychange', this.refresh, options);
      this.media.addEventListener('change', () => { this.measure(); }, options);
      this.observer = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting; this.refresh();
      });
      this.observer.observe(this.root);
      this.resize = new ResizeObserver(() => this.queueMeasure());
      this.resize.observe(this.root);
      this.mutations = new MutationObserver(() => this.queueMeasure());
      this.mutations.observe(list, { childList: true });
      this.measure();
    }

    queueMeasure() {
      cancelAnimationFrame(this.measureFrame);
      this.measureFrame = requestAnimationFrame(this.measure);
    }

    measure() {
      if (this.destroyed) return;
      this.timeline?.kill();
      this.buttons?.forEach(({ element }) => {
        for (const p of ['--nudge-x', '--nudge-y', '--nudge-r']) element.style.removeProperty(p);
      });
      const rect = this.root.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      this.unit = Math.min(1, this.width / 560);
      this.scale = .74 * this.unit;
      this.avatarLink.style.width = `${320 * this.scale}px`;
      this.avatarLink.style.height = `${300 * this.scale}px`;
      this.avatarLink.style.transformOrigin = `${160 * this.scale}px ${145 * this.scale}px`;
      this.buttons = [...list.querySelectorAll('button')].map(element => {
        // offset metrics are unaffected by the entry/hover/pressure transforms.
        const x = list.offsetLeft + element.offsetLeft;
        const y = list.offsetTop + element.offsetTop;
        return { element, x, y, width: element.offsetWidth, height: element.offsetHeight, spring: spring() };
      });
      if (this.buttons.length !== 5 || !this.width) return;
      const row1 = this.buttons[0];
      const row2 = this.buttons.find(b => b.y > row1.y + 20) || this.buttons[3];
      const topRow = this.buttons.filter(b => Math.abs(b.y - row1.y) < 10);
      const lowerRow = this.buttons.filter(b => Math.abs(b.y - row2.y) < 10);
      const lastTop = topRow.at(-1), prevTop = topRow.at(-2) || row1;
      const lastLower = lowerRow.at(-1);
      const gapY = (row1.y + row1.height + row2.y) / 2;
      const secondTop = topRow[1] || lastTop;
      const homes = {
        times: [[row1.x - 18,row1.y + 20],[lastTop.x + lastTop.width + 18,row1.y + 20]],
        sum: [[row1.x + row1.width / 2,row1.y - 18],[lastTop.x + lastTop.width / 2,row1.y - 19]],
        dot: [[(row1.x + row1.width + secondTop.x) / 2,row1.y + 34],[(prevTop.x + prevTop.width + lastTop.x) / 2,row1.y + 34]],
        theta: [[row2.x - 18,row2.y + 42],[lastLower.x + lastLower.width + 18,row2.y + 42]],
        nabla: [[this.width * .57,gapY]], sigma: [[row1.x + 18,gapY]],
        root: [[lastTop.x + lastTop.width - 16,gapY]], partial: [[this.width * .32,gapY]],
        transpose: [[this.width * .43,gapY]],
        exp: [[(row2.x + row2.width + lastLower.x) / 2,row2.y + row2.height / 2]]
      };
      this.glyphs.forEach(glyph => {
        glyph.home = point(...homes[glyph.kind][glyph.index]);
        glyph.owner = 'pile'; glyph.nudge = spring(); glyph.mix = 0;
      });
      this.home = point(this.width * .54, 98);
      this.actor = { ...this.home, rotation: 0, gazeX: 0, gazeY: .3, headYaw: 0, headPitch: 0, turnWeight: 0 };
      this.left = { x: this.home.x - 85, y: 160 };
      this.right = { x: this.home.x + 85, y: 160 };
      this.hand = this.right;
      this.path = { progress: 0 };
      this.flight = { progress: 0 };
      this.look = { x: 0, y: 0 };
      this.scan = { active: false, progress: 0 };
      this.active = null;
      this.handMode = 'free';
      this.root.dataset.phase = 'idle';
      avatar.setReferenceFace(null);
      avatar.setSceneTurn();
      avatar.setState('idle');
      this.timeline = this.createTimeline();
      this.render();
      this.refresh();
    }

    say(text) {
      this.speech.textContent = text;
      this.speechSize = { width: this.speech.offsetWidth, height: this.speech.offsetHeight };
    }

    updateSpeech() {
      const episode = this.active?.owner === 'face' ? this.episode : null;
      // Wait for the throw and return to finish before starting the interlude.
      const returning = ['remove', 'throw', 'settle'].includes(this.root.dataset.phase);
      const mode = episode?.symbol || (returning ? null : 'transition');
      this.speech.hidden = mode === null;
      if (this.speechMode === mode) return;
      this.speechMode = mode;
      if (mode === null) return;
      // One choice lasts for the entire interlude, including the next search.
      this.say(episode ? episode.caption : transitionLines[Math.floor(Math.random() * transitionLines.length)]);
    }

    phase(name) {
      this.root.dataset.phase = name;
      avatar.blinkSuppressed = name === 'search' || name === 'grasp';
    }

    bump(index, direction = 1, strength = 1) {
      const s = this.buttons[index % this.buttons.length].spring;
      s.vx += direction * 52 * strength;
      s.vy -= 90 * strength;
      s.vr += direction * 44 * strength;
      this.glyphs.forEach(g => {
        if (g.owner !== 'pile') return;
        const b = this.buttons[index % this.buttons.length];
        const distance = Math.hypot(g.home.x - b.x - b.width / 2, g.home.y - b.y - b.height / 2);
        const force = Math.max(0, 1 - distance / 240) * strength;
        g.nudge.vx += direction * 65 * force;
        g.nudge.vy -= 88 * force;
        g.nudge.vr += direction * 95 * force;
      });
    }

    setDepth(glyph, front) {
      if (glyph.front === front) return;
      this.layers[front ? 'front' : 'back'].append(glyph.element);
      glyph.front = front;
    }

    socket(glyph = this.active) {
      const part = glyph?.part || { x: 160, y: 174 };
      const pose = avatar.getFacePoint(part.x, part.y);
      const localX = pose.x - 160;
      const localY = pose.y - 145;
      const turn = radians(this.actor.rotation);
      return {
        x: this.actor.x + (localX * Math.cos(turn) - localY * Math.sin(turn)) * this.scale,
        y: this.actor.y + (localX * Math.sin(turn) + localY * Math.cos(turn)) * this.scale,
        rotation: pose.rotation + this.actor.rotation,
        skewX: pose.skewX || 0,
        scaleX: this.scale * pose.scaleX,
        scaleY: this.scale * pose.scaleY
      };
    }

    startReach() {
      this.episode.props.forEach(g => { g.reachFrom = point(g.hand.x, g.hand.y); });
      this.path.progress = 0;
      this.handMode = 'face';
    }

    releaseFace() {
      this.episode.props.forEach(g => {
        const socket = this.socket(g);
        Object.assign(g.hand, point(socket.x, socket.y));
      });
      this.handMode = 'free';
    }

    createTimeline() {
      const tl = gsap.timeline({ paused: true, repeat: -1, repeatRefresh: true, defaults: { ease: 'power2.inOut' } });
      let start = 0;
      this.episodes.forEach(episode => {
        const props = episode.props, g = props[0];
        const paired = props.length === 2;
        props.forEach((prop,index) => {
          prop.side = paired ? (index ? 1 : -1) : (prop.home.x < this.home.x ? -1 : 1);
          prop.hand = prop.side === 1 ? this.right : this.left;
        });
        const sign = g.side, supportHand = sign === 1 ? this.left : this.right;
        const supportIndex = sign === 1 ? 1 : 2, support = this.buttons[supportIndex];
        const lean = clamp(g.home.x - this.home.x,-42,42), s = start;
        episode.start = s;
        tl.addLabel(episode.symbol + ':search',s);
        tl.call(() => {
          this.episode = episode; this.active = g; this.hand = g.hand;
          this.scan.active = false;
          avatar.setSceneGaze(0,.25);
          this.phase('search'); avatar.setState('idle');
        },[],s);
        tl.to(this.actor,{x:this.home.x+lean,y:this.home.y+14,rotation:lean/9,gazeX:0,gazeY:.25,duration:.8},s);
        // Look down first, sweep a downward semicircle from left to right, then
        // settle on the actual pickup location before either hand grasps it.
        tl.to(this.look,{x:-.95,y:.4,duration:.3},s);
        tl.call(() => { this.scan.active=true; this.scan.progress=0; },[],s+.3);
        tl.to(this.scan,{progress:1,duration:.95,ease:'none'},s+.3);
        tl.call(() => { this.scan.active=false; this.look.x=.95; this.look.y=.4; },[],s+1.25);
        tl.to(this.look,{x:clamp((g.home.x-this.home.x-lean)/130,-1,1),y:clamp((g.home.y-this.home.y-14)/140,.25,1),duration:.45},s+1.25);
        if(!paired) {
          tl.to(supportHand,{x:support.x+support.width*(sign===1?.2:.8),y:support.y+6,duration:.75},s+.1);
          tl.call(() => this.bump(supportIndex,-sign,.9),[],s+.85);
        }
        const touched = [];
        props.forEach((prop,index) => {
          const searchX = clamp(prop.home.x,36,this.width-36);
          tl.to(prop.hand,{x:searchX-prop.side*28,y:prop.home.y+18,duration:.8},s+.2);
          tl.to(prop.hand,{x:searchX+prop.side*18,y:prop.home.y+5,duration:.43},s+1);
          const touchedIndex = this.buttons.reduce((best,b,index) => {
            const distance=Math.hypot(searchX-b.x-b.width/2,prop.home.y-b.y-b.height/2);
            return distance<best.distance?{index,distance}:best;
          },{index:0,distance:Infinity}).index;
          touched.push(touchedIndex);
          tl.call(() => this.bump(touchedIndex,prop.side,1),[],s+1.43+index*.12);
          tl.to(prop.hand,{x:prop.home.x,y:prop.home.y,duration:.45},s+1.5);
        });
        tl.call(() => { this.phase('grasp'); },[],s+1.96);
        tl.call(() => {
          props.forEach(prop => {
            prop.owner='hand'; prop.nudge=spring(); prop.mix=0;
            this.setDepth(prop,true);
          });
          this.startReach(); this.phase('carry');
        },[],s+2.15);
        tl.to(this.look,{x:0,y:0,duration:.7},s+2.15);
        tl.to(this.path,{progress:1,duration:1.15,ease:'sine.inOut'},s+2.15);
        tl.to(this.actor,{x:this.home.x,y:this.home.y-4,rotation:0,gazeX:0,gazeY:0,duration:1},s+2.2);
        tl.call(() => {
          this.releaseFace();
          props.forEach(prop => { prop.owner='face'; prop.mix=1; this.setDepth(prop,false); });
          this.phase('wear'); avatar.setState('idle');
        },[],s+3.3);
        tl.to(this.left,{x:this.home.x-100,y:144,duration:.55},s+3.4);
        tl.to(this.right,{x:this.home.x+100,y:144,duration:.55},s+3.4);
        tl.addLabel(episode.symbol + ':pose',s+3.9);
        tl.call(() => this.phase('pose'),[],s+3.95);
        tl.to(this.actor,{rotation:episode.tilt,y:this.home.y-13,gazeX:-.15,duration:.6,ease:'back.out(1.5)'},s+3.9);
        // Show both directions explicitly; idle turns must not cancel this beat.
        tl.to(this.actor,{headYaw:-avatar.config.depth.idleYaw,headPitch:-avatar.config.depth.idlePitch,turnWeight:1,duration:.55,ease:'sine.inOut'},s+3.9);
        tl.to(supportHand,{x:this.home.x-sign*107,y:112,duration:.5},s+4.05);
        tl.to(this.actor,{rotation:-episode.tilt*.4,gazeX:.2,duration:.65},s+4.7);
        tl.to(this.actor,{headYaw:avatar.config.depth.idleYaw,headPitch:avatar.config.depth.idlePitch,duration:.65,ease:'sine.inOut'},s+4.7);
        tl.to(this.actor,{rotation:episode.tilt*.55,gazeX:0,duration:.55},s+5.5);
        tl.to(this.actor,{headYaw:0,headPitch:0,duration:.55,ease:'sine.inOut'},s+5.5);
        tl.to(this.actor,{turnWeight:0,duration:.45,ease:'sine.inOut'},s+6.15);
        tl.call(() => { this.phase('remove'); this.startReach(); },[],s+6.15);
        tl.to(this.path,{progress:1,duration:.65},s+6.15);
        tl.call(() => {
          this.releaseFace();
          props.forEach(prop => { prop.owner='hand'; this.setDepth(prop,true); });
          avatar.setState('idle');
        },[],s+6.8);
        props.forEach(prop => {
          tl.to(prop.hand,{x:this.home.x+prop.side*105,y:this.home.y+32,duration:.55},s+6.8);
          tl.to(prop,{mix:0,duration:.45},s+6.85);
          tl.to(prop.hand,{x:this.home.x+prop.side*130,y:this.home.y-24,duration:.26,ease:'power2.in'},s+7.4);
        });
        tl.to(this.actor,{rotation:-5,duration:.45},s+6.9);
        tl.call(() => {
          this.phase('throw');
          props.forEach(prop => {
            prop.flightFrom=point(prop.hand.x,prop.hand.y);
            prop.flightPose={...prop.position}; prop.owner='flight';
          });
          this.flight.progress=0;
        },[],s+7.66);
        tl.to(this.flight,{progress:1,duration:1.1,ease:'none'},s+7.66);
        props.forEach(prop => tl.to(prop.hand,{x:this.home.x+prop.side*107,y:115,duration:.5},s+7.68));
        if(!paired) tl.to(supportHand,{x:this.home.x-sign*85,y:160,duration:.7},s+7.8);
        tl.call(() => {
          props.forEach(prop => {
            prop.owner='pile'; prop.nudge.vy=55; prop.nudge.vr=prop.side*75;
            this.setDepth(prop,false);
          });
          this.bump(touched[0],-sign,.7); this.phase('settle');
        },[],s+8.76);
        tl.to(this.actor,{x:this.home.x,y:this.home.y,rotation:0,gazeX:0,gazeY:.3,duration:.9},s+8.1);
        props.forEach(prop => tl.to(prop.hand,{x:this.home.x+prop.side*85,y:160,duration:.8},s+8.2));
        tl.call(() => { this.active=null; this.phase('idle'); },[],s+9.05);
        start=s+9.05;
      });
      return tl;
    }

    refresh() {
      if (!this.timeline || this.destroyed) return;
      const moving = this.visible && !document.hidden && !this.media.matches;
      this.running = moving;
      avatar.setScenePaused(!moving);
      gsap.ticker.remove(this.tick);
      if (moving) gsap.ticker.add(this.tick);
      if (moving) this.timeline.play();
      else this.timeline.pause();
      if (this.media.matches) {
        this.phase('idle');
        avatar.mouth.style.visibility = '';
        this.render();
      }
    }

    tick(_time, delta) {
      const dt = Math.min(delta / 1000, .04);
      this.elapsed += dt;
      this.buttons.forEach(b => stepSpring(b.spring, dt));
      this.glyphs.forEach(g => stepSpring(g.nudge, dt));
      this.render();
    }

    drawArm(side, hand, index) {
      const u = this.unit, turn = radians(this.actor.rotation);
      const mount = avatar.getBodyAttachment(side);
      const sx = (mount.x - 160) * this.scale, sy = (mount.y - 145) * this.scale;
      const shoulder = point(this.actor.x + sx * Math.cos(turn) - sy * Math.sin(turn),
        this.actor.y + sx * Math.sin(turn) + sy * Math.cos(turn));
      const dx = hand.x - shoulder.x, dy = hand.y - shoulder.y;
      const elbow = point(shoulder.x + dx * .44 + side * 25 * u,
        shoulder.y + dy * .48 + 32 * u);
      const wrist = point(hand.x + side * 10 * u, hand.y + 2 * u);
      this.arms[index].arm.setAttribute('d', `M${shoulder.x} ${shoulder.y}Q${elbow.x} ${elbow.y} ${wrist.x} ${wrist.y}`);
    }

    render() {
      const a = this.actor;
      const worn = this.active?.owner === 'face';
      const replaced = new Set((this.episode?.props || []).filter(g => ['hand','face'].includes(g.owner)).map(g => g.part.replaces));
      const native = { leftEye: avatar.eyes[0], rightEye: avatar.eyes[1], mouth: avatar.mouth };
      Object.entries(native).forEach(([name,element]) => { element.style.visibility = worn || replaced.has(name) ? 'hidden' : ''; });
      avatar.setReferenceFace(worn ? this.episode : null);
      this.updateSpeech();
      this.avatarLink.style.transform = `translate(${a.x - 160 * this.scale}px, ${a.y - 145 * this.scale}px) rotate(${a.rotation}deg)`;
      // Reserve the area above the body's bounding circle, including its float.
      const body = avatar.bodyPose, angle = radians(a.rotation);
      const bodyTop = a.y + body.float * Math.cos(angle) * this.scale -
        (avatar.config.shape.radius + avatar.config.shape.depth + avatar.config.shape.contourOffset + 3) * this.scale * Math.max(body.scaleX,body.scaleY);
      this.speech.style.transform = `translate(${clamp(a.x - this.speechSize.width / 2 + 36,0,this.width-this.speechSize.width)}px, ${bodyTop-this.speechSize.height-28}px)`;
      if (this.scan.active) {
        this.look.x = -Math.cos(this.scan.progress * Math.PI) * .95;
        this.look.y = .4 + Math.sin(this.scan.progress * Math.PI) * .6;
      }
      if (this.active) avatar.setSceneGaze(a.gazeX + this.look.x * .65,a.gazeY + this.look.y * .5);
      else avatar.setSceneGaze();
      avatar.setSceneTurn(a.headYaw,a.headPitch,a.turnWeight);
      if (this.handMode === 'face') {
        const p = this.path.progress, arc = Math.sin(p * Math.PI);
        this.episode.props.forEach(g => {
          const socket = this.socket(g);
          g.hand.x = mix(g.reachFrom.x,socket.x,p) + g.side * 22 * arc;
          g.hand.y = mix(g.reachFrom.y,socket.y,p) - 30 * arc;
        });
      }
      this.buttons.forEach(({ element, spring: s }) => {
        element.style.setProperty('--nudge-x', `${s.x.toFixed(2)}px`);
        element.style.setProperty('--nudge-y', `${s.y.toFixed(2)}px`);
        element.style.setProperty('--nudge-r', `${s.r.toFixed(2)}deg`);
      });
      this.glyphs.forEach(g => {
        const socket = this.socket(g);
        let x = g.home.x + g.nudge.x, y = g.home.y + g.nudge.y;
        let rx = g.rx, ry = g.ry, rz = g.rz + g.nudge.r, skewX = 0;
        let sx = this.unit * g.pileScale, sy = sx, front = false;
        let shade = 0;
        if (g.owner === 'hand') {
          x = g.hand.x; y = g.hand.y; front = true;
          const p = this.handMode === 'face' ? this.path.progress : g.mix;
          sx = mix(this.unit * g.pileScale, socket.scaleX, p);
          sy = mix(this.unit * g.pileScale, socket.scaleY, p);
          rx *= 1 - p; ry *= 1 - p; rz = mix(g.rz, socket.rotation, p);
          skewX = socket.skewX * p;
          shade = p;
        } else if (g.owner === 'face') {
          x = socket.x; y = socket.y; rz = socket.rotation;
          rx = 0; ry = 0; sx = socket.scaleX; sy = socket.scaleY; shade = 1;
          skewX = socket.skewX;
        } else if (g.owner === 'flight') {
          const p = this.flight.progress, q = 1 - p;
          const control = point((g.flightFrom.x + g.home.x) / 2 + g.side * 28, -24);
          x = q * q * g.flightFrom.x + 2 * q * p * control.x + p * p * g.home.x;
          y = q * q * g.flightFrom.y + 2 * q * p * control.y + p * p * g.home.y;
          rx = mix(g.flightPose.rx, g.rx + 360, p); ry = mix(g.flightPose.ry, g.ry, p);
          rz = mix(g.flightPose.rz, g.rz + 360, p);
          skewX = mix(g.flightPose.skewX, 0, p);
          sx = mix(g.flightPose.sx, this.unit * g.pileScale, p);
          sy = mix(g.flightPose.sy, this.unit * g.pileScale, p);
          front = p < .72;
        }
        this.setDepth(g, front);
        const color = g.rgb.map((c, i) => Math.round(mix(c, [23, 43, 88][i], shade)));
        g.element.style.color = `rgb(${color.join(',')})`;
        g.element.style.transform = `translate(${x - 28}px, ${y - 28}px) perspective(650px) rotateZ(${rz}deg) skewX(${skewX}deg) rotateY(${ry}deg) rotateX(${rx}deg) scale(${sx}, ${sy})`;
        g.element.style.opacity = g.owner === 'pile' ? '.84' : '1';
        const blinkingEye = g.owner === 'face' && ['leftEye','rightEye'].includes(g.part.key) && this.episode.blinkEyes !== false;
        const artRotation = (g.part.pileRotation || 0) * (1 - shade);
        g.ink.setAttribute('transform', `rotate(${artRotation}) scale(1 ${blinkingEye ? avatar.getEyeBlink() : 1})`);
        g.element.querySelector('.theatre-glyph-edge').style.opacity = (1 - shade) * .8;
        g.position = { x, y, rx, ry, rz, skewX, sx, sy };
        g.element.dataset.owner = g.owner;
      });
      this.drawArm(-1, this.left, 0);
      this.drawArm(1, this.right, 1);
    }

    destroy() {
      this.destroyed = true;
      this.timeline?.kill();
      gsap.ticker.remove(this.tick);
      cancelAnimationFrame(this.measureFrame);
      this.events.abort();
      this.observer.disconnect(); this.resize.disconnect(); this.mutations.disconnect();
      Object.values(this.layers).forEach(node => node.remove());
      this.root.querySelectorAll('.theatre-arms').forEach(node => node.remove());
      this.buttons.forEach(({ element }) => {
        for (const p of ['--nudge-x', '--nudge-y', '--nudge-r']) element.style.removeProperty(p);
      });
      this.root.classList.remove('symbol-theatre');
      this.intro.classList.remove('has-symbol-theatre');
      delete this.root.dataset.phase;
      this.originalParent.insertBefore(avatar.root, this.originalNext);
      this.avatarLink.remove(); this.speech.remove();
      avatar.root.setAttribute('aria-label', this.originalLabel);
      [...avatar.eyes,avatar.mouth].forEach(element => { element.style.visibility = ''; });
      avatar.setReferenceFace(null); avatar.setSceneGaze();
      avatar.setSceneTurn();
      avatar.blinkSuppressed = false;
      avatar.setScenePaused(false);
      avatar.setState('idle'); avatar.resumeExpressions();
    }
  }

  window.catalogTheatre = new SymbolTheatre();
})();
