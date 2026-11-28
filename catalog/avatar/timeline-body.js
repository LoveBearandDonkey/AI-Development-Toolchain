(() => {
  'use strict';

  const { clamp, mix, getBlockProjection, getBlockSilhouettePath, createSweepCache, getSweepFrame, holdDuration,
    sweepDuration, easeSweep, createPaletteSweep, advancePaletteSweep } = window.RoundedBlock;
  const viewWidth = 320;
  const viewHeight = 300;
  const baseRasterWidth = 160;
  const maxRasterWidth = 320;
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const restMotion = { roll: 0, float: 0, scaleX: 1, scaleY: 1 };
  let silhouetteCount = 0;

  function createBodyCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = baseRasterWidth;
    canvas.height = baseRasterWidth * viewHeight / viewWidth;
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    return canvas;
  }

  function mountBodyCanvas(container, rig, clipSilhouette = false) {
    const layer = document.createElementNS(svgNamespace, 'foreignObject');
    layer.setAttribute('x', rig.centerX - viewWidth / 2);
    layer.setAttribute('y', rig.centerY - viewHeight / 2);
    layer.setAttribute('width', viewWidth);
    layer.setAttribute('height', viewHeight);
    layer.setAttribute('pointer-events', 'none');
    const canvas = createBodyCanvas();
    layer.append(canvas);
    if (!clipSilhouette) {
      container.replaceChildren(layer);
      return { canvas };
    }

    const outline = document.createElementNS(svgNamespace, 'path');
    outline.setAttribute('transform', `translate(${rig.centerX} ${rig.centerY})`);
    const clipPath = document.createElementNS(svgNamespace, 'clipPath');
    clipPath.id = `avatar-silhouette-${++silhouetteCount}`;
    clipPath.append(outline);
    const clippedBody = document.createElementNS(svgNamespace, 'g');
    clippedBody.setAttribute('clip-path', `url(#${clipPath.id})`);
    clippedBody.append(layer);
    container.replaceChildren(clipPath, clippedBody);
    return { canvas, outline };
  }

  function mountAvatarArms(backLayer, frontLayer) {
    const strokeWidth = 10.8;
    const outline = 2;
    const makeStroke = (color, width, linecap = 'round') => {
      const path = document.createElementNS(svgNamespace, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', width);
      path.setAttribute('stroke-linecap', linecap);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      return path;
    };
    const outerWidth = strokeWidth + 2 * outline;
    const arms = new Map([-1, 1].map(side => {
      const group = document.createElementNS(svgNamespace, 'g');
      group.dataset.armSide = side < 0 ? 'left' : 'right';
      group.append(makeStroke('#fff', outerWidth), makeStroke('#000', strokeWidth));
      frontLayer.append(group);
      return [side, { group }];
    }));

    return (side, shoulder, hand, unit = 1) => {
      const arm = arms.get(side);
      const { group } = arm;
      const layer = shoulder.behind ? backLayer : frontLayer;
      if (group.parentNode !== layer) layer.append(group);
      const front = clamp(hand.front ?? 0);
      // Swing the elbow around the side before the wrist crosses in front of the face.
      const wrap = 44 * front * clamp(shoulder.rearFacing * 10);
      const elbowX = mix(shoulder.x, hand.x, 0.44) + side * (25 + wrap) * unit;
      const elbowY = mix(shoulder.y, hand.y, 0.48) + 32 * unit;
      const wristX = hand.x + side * 10 * unit;
      const wristY = hand.y + 2 * unit;
      const path = `M${shoulder.x} ${shoulder.y}Q${elbowX} ${elbowY} ${wristX} ${wristY}`;
      for (const stroke of group.children) stroke.setAttribute('d', path);
      const frontLength = shoulder.behind ? front * 0.62 : 0;
      if (frontLength <= 0) {
        if (arm.reach) arm.reach.style.display = 'none';
        return;
      }
      if (!arm.reach) {
        arm.reach = document.createElementNS(svgNamespace, 'g');
        arm.reach.dataset.armReach = group.dataset.armSide;
        arm.reach.append(makeStroke('#fff', outerWidth, 'butt'), makeStroke('#fff', outerWidth),
          makeStroke('#000', strokeWidth, 'butt'), makeStroke('#000', strokeWidth));
        frontLayer.append(arm.reach);
      }
      arm.reach.style.display = '';

      // Subdivide the same curve so the wrist can pass in front without revealing the shoulder.
      const t = 1 - frontLength;
      const controlX = mix(elbowX, wristX, t), controlY = mix(elbowY, wristY, t);
      const startX = mix(mix(shoulder.x, elbowX, t), controlX, t);
      const startY = mix(mix(shoulder.y, elbowY, t), controlY, t);
      const tail = `M${startX} ${startY}Q${controlX} ${controlY} ${wristX} ${wristY}`;
      const cap = `M${wristX} ${wristY}h0`;
      const [outerTail, outerCap, innerTail, innerCap] = arm.reach.children;
      outerTail.setAttribute('d', tail);
      innerTail.setAttribute('d', tail);
      outerCap.setAttribute('d', cap);
      innerCap.setAttribute('d', cap);
    };
  }

  class TimelineAvatarBody {
    constructor(config, { canvas = createBodyCanvas(), outline } = {}) {
      this.shape = config.shape;
      this.rig = config.rig;
      this.perspective = config.depth.perspective;
      const { softness, rim, rimDepth } = config.material;
      this.material = { softness, rim, rimDepth };
      this.canvas = canvas;
      this.outline = outline;
      this.context = canvas.getContext('2d');
      this.cache = createSweepCache(canvas);
      this.sweep = createPaletteSweep();
      this.elapsed = 0;
      this.currentWidth = this.randomWidth();
      this.nextWidth = this.randomWidth();
    }

    randomWidth() {
      return this.shape.height * mix(this.shape.minWidthRatio, this.shape.maxWidthRatio, Math.random());
    }

    advance(delta) {
      this.elapsed += delta;
      const cycle = holdDuration + sweepDuration;
      while (this.elapsed >= cycle) this.nextSegment(this.elapsed - cycle);
      this.sweep.progress = clamp((this.elapsed - holdDuration) / sweepDuration);
    }

    nextSegment(elapsed = 0) {
      this.elapsed = elapsed;
      advancePaletteSweep(this.sweep);
      this.currentWidth = this.nextWidth;
      this.nextWidth = this.randomWidth();
    }

    setPixelWidth(pixelWidth) {
      // Multiples of 16 preserve the 16:15 viewport with whole pixels on both axes.
      const width = 16 * Math.ceil(clamp(pixelWidth, baseRasterWidth, maxRasterWidth) / 16);
      if (width === this.canvas.width) return;
      const { yaw, pitch } = this.rendered;
      this.canvas.width = width;
      this.canvas.height = width * viewHeight / viewWidth;
      this.cache = createSweepCache(this.canvas);
      this.rendered = undefined;
      this.render(yaw, pitch);
    }

    render(yaw = this.shape.restYaw, pitch = this.shape.restPitch) {
      const rasterScale = this.canvas.width / viewWidth;
      const width = mix(this.currentWidth, this.nextWidth, easeSweep(this.sweep.progress));
      const previous = this.rendered;
      const geometryChanged = !previous || previous.yaw !== yaw || previous.pitch !== pitch || previous.width !== width;
      if (geometryChanged) {
        this.settings = {
          pose: 'long', length: width, height: this.shape.height, width: this.shape.depth,
          rounding: this.shape.rounding, yaw: yaw * 180 / Math.PI,
          pitch: pitch * 180 / Math.PI, pixelSize: 1 / rasterScale,
          maskPadding: this.outline ? 2 : 0,
          ...this.material,
        };
        this.projection = getBlockProjection(this.settings);
        this.outline?.setAttribute('d', getBlockSilhouettePath(this.projection));
        this.cache.colors.clear();
        this.cache.output.data.fill(0);
      } else if (previous.color === this.sweep.current && previous.progress === this.sweep.progress) {
        return;
      }
      const frame = getSweepFrame(this.canvas, this.settings, this.sweep, this.cache, rasterScale);
      this.context.putImageData(frame, 0, 0);
      this.rendered = { yaw, pitch, width, color: this.sweep.current, progress: this.sweep.progress };
    }

    project(x, y, z, motion = restMotion) {
      const { rightAxis, upAxis } = this.projection;
      const screenX = (rightAxis[0] * x - rightAxis[1] * y + rightAxis[2] * z) * motion.scaleX;
      const screenY = (-upAxis[0] * x + upAxis[1] * y - upAxis[2] * z) * motion.scaleY;
      const angle = motion.roll * Math.PI / 180;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      return {
        x: this.rig.centerX + screenX * cos - screenY * sin,
        y: this.rig.centerY + motion.float + screenX * sin + screenY * cos,
      };
    }

    armAttachment(side, motion) {
      const { halfLength, eyeAxis } = this.projection;
      // The side face points toward the camera only if its normal has a positive dot product.
      const anchor = this.project(side * halfLength, this.rig.shoulderY, 0, motion);
      const rearFacing = -side * eyeAxis[0];
      return { ...anchor, behind: rearFacing > 0, rearFacing };
    }

    get faceDepth() {
      return this.projection.halfDepth + this.rig.faceOffset;
    }

    facePlane(motion = restMotion) {
      const z = this.faceDepth;
      const { yaw, pitch } = this.rendered;
      const scale = this.perspective / (this.perspective + z * (1 - Math.cos(yaw) * Math.cos(pitch)));
      const faceMotion = { ...motion, scaleX: motion.scaleX * scale, scaleY: motion.scaleY * scale };
      const { centerX, centerY, faceScale } = this.rig;
      const center = this.project(0, 0, z, faceMotion);
      const horizontal = this.project(faceScale, 0, z, faceMotion);
      const vertical = this.project(0, faceScale, z, faceMotion);
      const a = horizontal.x - center.x, b = horizontal.y - center.y;
      const c = vertical.x - center.x, d = vertical.y - center.y;
      return { a, b, c, d, e: center.x - a * centerX - c * centerY, f: center.y - b * centerX - d * centerY };
    }
  }

  function setFacePlane(face, { a, b, c, d, e, f }) {
    face.setAttribute('transform', `matrix(${a} ${b} ${c} ${d} ${e} ${f})`);
  }

  function createAvatarFacePart(part) {
    const element = document.createElementNS(svgNamespace, 'g');
    element.dataset.referencePart = part.key;
    element.setAttribute('transform', `translate(${part.x} ${part.y})`);
    element.innerHTML = `<g class="avatar-reference-ink" transform="translate(${-part.x} ${-part.y})">${part.art}</g>`;
    return element;
  }

  window.TimelineAvatarBody = { TimelineAvatarBody, mountBodyCanvas, mountAvatarArms, setFacePlane, createAvatarFacePart };
})();
