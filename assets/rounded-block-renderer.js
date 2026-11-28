(() => {
  'use strict';

  const palettes = {
    violet: { base: '#efdaf4', middle: '#aeb0fa', far: '#84668c', end: '#193a53', rim: '#efc8ee', light: '#f8f3f8', cap: 0.92 },
    cyan: { base: '#a6e7ce', middle: '#51b8dd', far: '#9ae7aa', end: '#427962', rim: '#8ee3d2', light: '#e0f0e9', cap: 0.67 },
    lime: { base: '#f0e2b9', middle: '#fcc865', far: '#facdc8', end: '#5790a5', rim: '#a3dc77', light: '#f6f4df', cap: 0.78 },
    amber: { base: '#fab95f', middle: '#f7ddc9', far: '#bf754e', end: '#ed9057', rim: '#f3ad51', light: '#ffe7ca', cap: 0.64 },
    ice: { base: '#cbdff3', middle: '#6ca9ee', far: '#587fbd', end: '#1d4269', rim: '#b8d9f3', light: '#edf6fb', cap: 0.83 },
    mint: { base: '#c4e8bf', middle: '#78d48d', far: '#44886f', end: '#32614d', rim: '#a8e5a2', light: '#eaf6dd', cap: 0.78 },
    rose: { base: '#f5d3dd', middle: '#ee92b0', far: '#aa526f', end: '#6b324d', rim: '#f5bdcd', light: '#fff0ed', cap: 0.82 },
    copper: { base: '#dfc2ae', middle: '#bf9173', far: '#926152', end: '#5d3f38', rim: '#e1af8f', light: '#f7ebe2', cap: 0.78 },
  };

  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const mix = (from, to, amount) => from + (to - from) * amount;
  const gaussian = (distance) => Math.exp(-0.5 * distance * distance);
  const smoothstep = (low, high, value) => {
    const t = clamp((value - low) / (high - low));
    return t * t * (3 - 2 * t);
  };
  const rgb = (hex) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const colorRoles = ['base', 'middle', 'far', 'end', 'rim', 'light'];
  const materials = Object.fromEntries(Object.entries(palettes).map(([id, palette]) => [id, {
    ...Object.fromEntries(colorRoles.map((role) => [role, rgb(palette[role])])),
    cap: palette.cap,
  }]));

  const holdDuration = 1800;
  const sweepDuration = 1000;
  const easeSweep = (progress) => 1 - (1 - progress) ** 3;

  function shufflePalettes(ids) {
    const choices = [...ids];
    for (let index = choices.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [choices[index], choices[swapIndex]] = [choices[swapIndex], choices[index]];
    }
    return choices;
  }

  function createPaletteSweep(paletteIds = Object.keys(palettes)) {
    const queue = shufflePalettes(paletteIds);
    return { paletteIds, queue, current: queue.shift(), next: queue.shift(), progress: 0 };
  }

  function advancePaletteSweep(sweep) {
    sweep.current = sweep.next;
    if (sweep.queue.length === 0) {
      sweep.queue = shufflePalettes(sweep.paletteIds);
      if (sweep.queue[0] === sweep.current) sweep.queue.push(sweep.queue.shift());
    }
    sweep.next = sweep.queue.shift();
    sweep.progress = 0;
  }

  function measureEdgeDistances(frame, bounds) {
    const { data, width, height } = frame;
    const left = Math.max(1, bounds.left);
    const right = Math.min(width - 1, bounds.right);
    const top = Math.max(1, bounds.top);
    const bottom = Math.min(height - 1, bounds.bottom);
    const distances = new Float32Array(width * height);
    const diagonal = Math.SQRT2;

    // Estimate inward distance from the antialiased silhouette with two chamfer passes.
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) {
        const index = row * width + column;
        const coverage = data[index * 4 + 3] / 255;
        distances[index] = coverage < 1 ? coverage - 0.5 : Math.min(
          distances[index - 1] + 1,
          distances[index - width] + 1,
          distances[index - width - 1] + diagonal,
          distances[index - width + 1] + diagonal,
        );
      }
    }

    for (let row = bottom - 1; row >= top; row -= 1) {
      for (let column = right - 1; column >= left; column -= 1) {
        const index = row * width + column;
        const offset = index * 4;
        if (data[offset + 3] === 0) continue;

        distances[index] = Math.min(
          distances[index],
          distances[index + 1] + 1,
          distances[index + width] + 1,
          distances[index + width + 1] + diagonal,
          distances[index + width - 1] + diagonal,
        );
      }
    }
    return distances;
  }

  function applyInnerRim(frame, geometry, color, localColors, strength, depth) {
    if (strength <= 0 || depth <= 0) return;

    const distances = geometry.edgeDistances ??= measureEdgeDistances(frame, geometry.bounds);
    for (let point = 0; point < geometry.indices.length; point += 1) {
      const index = geometry.indices[point];
      const distance = distances[index] - geometry.maskPadding;
      if (distance >= depth) continue;

      const amount = strength * (1 - smoothstep(0, depth, distance));
      const offset = index * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const rimColor = localColors ? localColors[point * 3 + channel] : color[channel];
        frame.data[offset + channel] = mix(frame.data[offset + channel], rimColor, amount);
      }
    }
  }

  const geometryCache = new WeakMap();
  const silhouetteCanvas = document.createElement('canvas');
  const silhouetteContext = silhouetteCanvas.getContext('2d', { willReadFrequently: true });

  function projectedHull(vertices) {
    vertices.sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
    const halfHull = (points) => {
      const hull = [];
      for (const point of points) {
        while (hull.length >= 2) {
          const [ax, ay] = hull[hull.length - 2];
          const [bx, by] = hull[hull.length - 1];
          if ((bx - ax) * (point[1] - ay) - (by - ay) * (point[0] - ax) > 0) break;
          hull.pop();
        }
        hull.push(point);
      }
      hull.pop();
      return hull;
    };
    return [...halfHull(vertices), ...halfHull(vertices.reverse())];
  }

  function rasterizeSilhouette(hull, width, height, radius) {
    silhouetteCanvas.width = width;
    silhouetteCanvas.height = height;
    const context = silhouetteContext;
    context.beginPath();
    context.moveTo(...hull[0]);
    for (const point of hull.slice(1)) context.lineTo(...point);
    context.closePath();
    // An orthographic projection of the rounded box is the core hull expanded by a disk.
    context.lineJoin = 'round';
    context.lineWidth = radius * 2;
    context.fill();
    context.stroke();
    return context.getImageData(0, 0, width, height).data;
  }

  function getBlockProjection(settings) {
    // Scale the radius to the shortest half-side so resizing keeps the rounded box valid.
    const halfLength = settings.length / 2;
    const halfHeight = settings.height / 2;
    const halfDepth = settings.width / 2;
    const radius = settings.rounding * Math.min(halfLength, halfHeight, halfDepth);
    const coreX = halfLength - radius;
    const coreY = halfHeight - radius;
    const coreZ = halfDepth - radius;

    const yaw = settings.yaw * Math.PI / 180;
    const elevation = settings.pitch * Math.PI / 180;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosElevation = Math.cos(elevation);
    const sinElevation = Math.sin(elevation);
    const upright = settings.pose === 'high';
    // Standing the block rotates its long axis onto world Y. Trace in local space
    // so the dimensions, fillets, and pigment coordinates keep their original axes.
    const toLocal = ([x, y, z]) => upright ? [y, -x, z] : [x, y, z];
    const rightAxis = toLocal([cosYaw, 0, sinYaw]);
    const upAxis = toLocal([sinElevation * sinYaw, cosElevation, -sinElevation * cosYaw]);
    const eyeAxis = toLocal([-cosElevation * sinYaw, sinElevation, cosElevation * cosYaw]);
    const lightAxis = toLocal([0.52, 0.75, -0.4]);
    const [rightX, rightY, rightZ] = rightAxis;
    const [upX, upY, upZ] = upAxis;
    const extentX = Math.abs(rightX) * coreX + Math.abs(rightY) * coreY + Math.abs(rightZ) * coreZ + radius;
    const extentY = Math.abs(upX) * coreX + Math.abs(upY) * coreY + Math.abs(upZ) * coreZ + radius;
    return { halfLength, halfHeight, halfDepth, radius, coreX, coreY, coreZ,
      rightAxis, upAxis, eyeAxis, lightAxis, extentX, extentY };
  }

  function projectBlockHull({ coreX, coreY, coreZ, rightAxis, upAxis }) {
    const [rightX, rightY, rightZ] = rightAxis;
    const [upX, upY, upZ] = upAxis;
    const vertices = [];
    for (const x of [-coreX, coreX]) {
      for (const y of [-coreY, coreY]) {
        for (const z of [-coreZ, coreZ]) {
          vertices.push([rightX * x + rightY * y + rightZ * z, -(upX * x + upY * y + upZ * z)]);
        }
      }
    }
    return projectedHull(vertices);
  }

  function getBlockSilhouettePath(projection) {
    const { radius } = projection;
    const hull = projectBlockHull(projection);
    const offsets = hull.map(([x, y], index) => {
      const [nextX, nextY] = hull[(index + 1) % hull.length];
      const length = Math.hypot(nextX - x, nextY - y);
      return [(nextY - y) * radius / length, (x - nextX) * radius / length];
    });
    // Round each vertex with an arc between the two outward offset edges.
    return hull.map(([x, y], index) => {
      const [inX, inY] = offsets[(index + hull.length - 1) % hull.length];
      const [outX, outY] = offsets[index];
      return `${index === 0 ? 'M' : 'L'}${x + inX} ${y + inY} A${radius} ${radius} 0 0 1 ${x + outX} ${y + outY}`;
    }).join(' ') + 'Z';
  }

  function getBlockGeometry(canvas, settings) {
    const { width, height } = canvas;
    const { faceShadow } = settings;
    const key = [width, height, settings.pose, settings.length, settings.width, settings.height,
      settings.rounding, settings.yaw, settings.pitch, settings.pixelSize, settings.maskPadding, settings.viewZoom,
      faceShadow?.radiusX, faceShadow?.radiusY, faceShadow?.opacity].join('|');
    const previous = geometryCache.get(canvas);
    if (previous?.key === key) return previous;

    const projection = getBlockProjection(settings);
    const { halfLength, halfHeight, halfDepth, radius, coreX, coreY, coreZ, extentX, extentY,
      rightAxis: [rightX, rightY, rightZ], upAxis: [upX, upY, upZ],
      eyeAxis: [eyeX, eyeY, eyeZ], lightAxis: [lightX, lightY, lightZ] } = projection;
    // Keep the ordinary framing until a shape would run into the canvas margins.
    const viewHeight = settings.pose === 'high' ? 6.8 : 4.65;
    const zoom = settings.viewZoom ?? 1;
    const pixel = settings.pixelSize ?? Math.max(
      7.25 / (width * zoom), viewHeight / (height * zoom),
      2 * extentX / (0.94 * width), 2 * extentY / (0.94 * height),
    );
    const hitDistance = pixel * 0.06;
    const reach = Math.hypot(halfLength, halfHeight, halfDepth) + pixel;
    const maskPadding = settings.maskPadding ?? 0;
    const margin = 2 + maskPadding;
    const left = Math.max(0, Math.floor(width / 2 - extentX / pixel - margin));
    const right = Math.min(width, Math.ceil(width / 2 + extentX / pixel + margin));
    const top = Math.max(0, Math.floor(height / 2 - extentY / pixel - margin));
    const bottom = Math.min(height, Math.ceil(height / 2 + extentY / pixel + margin));
    const hull = projectBlockHull(projection).map(([x, y]) => [width / 2 - left + x / pixel, height / 2 - top + y / pixel]);
    const maskWidth = right - left;
    const mask = rasterizeSilhouette(hull, maskWidth, bottom - top, radius / pixel + maskPadding);
    let count = 0;
    for (let offset = 3; offset < mask.length; offset += 4) {
      if (mask[offset] > 0) count += 1;
    }
    const indices = new Uint32Array(count);
    const alpha = new Uint8Array(count);
    const surface = {
      u: new Float32Array(count), cross: new Float32Array(count), axis: new Float32Array(count),
      cap: new Float32Array(count), highlight: new Float32Array(count), shade: new Float32Array(count),
    };
    let point = 0;

    for (let row = top; row < bottom; row += 1) {
      const screenY = (height / 2 - row - 0.5) * pixel;
      for (let column = left; column < right; column += 1) {
        const coverage = mask[((row - top) * maskWidth + column - left) * 4 + 3];
        if (coverage === 0) continue;

        const screenX = (column + 0.5 - width / 2) * pixel;
        const originX = screenX * rightX + screenY * upX + eyeX * reach;
        const originY = screenX * rightY + screenY * upY + eyeY * reach;
        const originZ = screenX * rightZ + screenY * upZ + eyeZ * reach;

        // Sphere trace only the rays covered by the projected silhouette.
        let t = 0;
        let closest = Infinity;
        let closestT = 0;
        for (let step = 0; step < 96 && t < reach * 2; step += 1) {
          const dx = Math.abs(originX - eyeX * t) - coreX;
          const dy = Math.abs(originY - eyeY * t) - coreY;
          const dz = Math.abs(originZ - eyeZ * t) - coreZ;
          const px = Math.max(dx, 0);
          const py = Math.max(dy, 0);
          const pz = Math.max(dz, 0);
          const distance = Math.sqrt(px * px + py * py + pz * pz)
            + Math.min(Math.max(dx, dy, dz), 0) - radius;
          if (distance >= closest) break;
          closest = distance;
          closestT = t;
          if (distance <= hitDistance) break;
          t += distance;
        }
        const x = originX - eyeX * closestT;
        const y = originY - eyeY * closestT;
        const z = originZ - eyeZ * closestT;
        const dx = x - clamp(x, -coreX, coreX);
        const dy = y - clamp(y, -coreY, coreY);
        const dz = z - clamp(z, -coreZ, coreZ);
        const normalLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nx = dx / normalLength;
        const ny = dy / normalLength;
        const nz = dz / normalLength;
        const facing = clamp(nx * eyeX + ny * eyeY + nz * eyeZ);

        const u = x / halfLength;
        const v = z / halfDepth;
        const cross = v + 0.3 * y / halfHeight;
        const grazing = (1 - facing) ** 1.9;
        const diffuse = clamp(lightX * nx + lightY * ny + lightZ * nz, -1, 1);
        const lowerBounce = smoothstep(0.0, 0.93, -y / halfHeight) * smoothstep(0.45, 0.95, v);
        const edgeLight = 0.55 * grazing * smoothstep(-0.22, 0.82, u) + 0.38 * lowerBounce;
        let shadow = 0;
        if (faceShadow && nz > 0.55) {
          // Shade the real front surface under the origin of the raised expression plane.
          const distanceSquared = (x / faceShadow.radiusX) ** 2 + (y / faceShadow.radiusY) ** 2;
          shadow = faceShadow.opacity * (1 - clamp(distanceSquared)) ** 2 * smoothstep(0.55, 1, nz);
        }
        surface.u[point] = u;
        surface.cross[point] = cross;
        surface.cap[point] = 0.43 + 0.57 * smoothstep(0.07, 0.78, Math.abs(nx));
        surface.highlight[point] = 0.07 + 0.18 * smoothstep(-0.55, 0.82, diffuse) + edgeLight;
        surface.shade[point] = (0.955 + 0.045 * diffuse) * (1 - shadow);
        surface.axis[point] = (u + 1) / 2 + 0.05 * cross * (1 - u * u);
        indices[point] = row * width + column;
        alpha[point] = coverage;
        point += 1;
      }
    }
    const geometry = { key, indices, alpha, surface, maskPadding, projectedWidth: 2 * extentX / pixel,
      bounds: { left, right, top, bottom } };
    geometryCache.set(canvas, geometry);
    return geometry;
  }

  function createBlockFrame(canvas, settings, resolutionScale) {
    const geometry = getBlockGeometry(canvas, settings);
    const { indices, alpha, surface } = geometry;
    const frame = canvas.getContext('2d').createImageData(canvas.width, canvas.height);
    const pixels = frame.data;
    const isMixed = settings.palette === 'mixed';
    const colorIds = isMixed ? settings.mixedPalettes : [settings.palette];
    const selectedMaterials = colorIds.map((id) => materials[id]);
    const lastMaterial = selectedMaterials.length - 1;
    const rimColors = isMixed && settings.rim > 0 && settings.rimDepth > 0
      ? new Uint8ClampedArray(indices.length * 3) : null;
    const spread = mix(0.7, 1.85, settings.softness);
    const transition = mix(0.23, 0.5, settings.softness);

    for (let point = 0; point < indices.length; point += 1) {
      const u = surface.u[point];
      const cross = surface.cross[point];
      const axis = surface.axis[point];
      const position = isMixed ? clamp(axis * selectedMaterials.length - 0.5, 0, lastMaterial) : 0;
      const materialIndex = Math.floor(position);
      const from = selectedMaterials[materialIndex];
      const to = selectedMaterials[Math.min(materialIndex + 1, lastMaterial)];
      const blend = smoothstep(0.5 - transition, 0.5 + transition, position - materialIndex);
      const centerField = gaussian((u + 0.28 - 0.1 * cross) / (0.22 * spread))
        * (0.44 + 0.52 * gaussian((cross - 0.48) / (0.64 * spread)));
      const middleField = isMixed ? Math.max(centerField, 0.58) : centerField;
      const farField = gaussian((u - 0.48 - 0.14 * cross) / (0.21 * spread))
        * (0.23 + 0.71 * gaussian((cross - 0.67) / (0.58 * spread)));
      const capField = mix(from.cap, to.cap, blend) * smoothstep(0.96 - 0.18 * spread, 0.96, Math.abs(u))
        * surface.cap[point];
      const highlight = surface.highlight[point] * (1 - 0.88 * capField) * (1 - 0.42 * farField);
      const shade = surface.shade[point];
      const index = indices[point];
      const offset = index * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const base = mix(from.base[channel], to.base[channel], blend);
        const middle = mix(from.middle[channel], to.middle[channel], blend);
        const far = mix(from.far[channel], to.far[channel], blend);
        const end = mix(from.end[channel], to.end[channel], blend);
        const light = mix(from.light[channel], to.light[channel], blend);
        let color = mix(base, middle, middleField);
        color = mix(color, far, farField);
        color = mix(color, end, capField);
        pixels[offset + channel] = mix(color, light, highlight) * shade;
        if (rimColors) rimColors[point * 3 + channel] = mix(from.rim[channel], to.rim[channel], blend);
      }
      pixels[offset + 3] = alpha[point];
    }
    applyInnerRim(frame, geometry, selectedMaterials[0].rim, rimColors,
      settings.rim, settings.rimDepth * resolutionScale);
    return frame;
  }

  function renderBlock(canvas, settings, resolutionScale = 1) {
    canvas.getContext('2d').putImageData(createBlockFrame(canvas, settings, resolutionScale), 0, 0);
  }

  function createSweepCache(canvas) {
    return {
      output: canvas.getContext('2d').createImageData(canvas.width, canvas.height),
      colors: new Map(),
    };
  }

  function getSweepColor(canvas, settings, cache, palette, resolutionScale) {
    if (!cache.colors.has(palette)) {
      cache.colors.set(palette, createBlockFrame(canvas, { ...settings, palette }, resolutionScale));
    }
    return cache.colors.get(palette);
  }

  function getSweepFrame(canvas, settings, sweep, cache, resolutionScale = 1) {
    const from = getSweepColor(canvas, settings, cache, sweep.current, resolutionScale);
    if (sweep.progress <= 0) return from;

    const to = getSweepColor(canvas, settings, cache, sweep.next, resolutionScale);
    if (sweep.progress >= 1) return to;

    // The sweep decelerates from the right edge to the left in screen coordinates.
    const feather = 0.14;
    const easedProgress = easeSweep(sweep.progress);
    const front = mix(1 + feather, -feather, easedProgress);
    const { output } = cache;
    const { indices, alpha, projectedWidth } = getBlockGeometry(canvas, settings);
    const { width } = canvas;
    const leftEdge = (width - projectedWidth) / 2;
    for (let point = 0; point < indices.length; point += 1) {
      const index = indices[point];
      const offset = index * 4;
      const position = clamp((index % width + 0.5 - leftEdge) / projectedWidth);
      const amount = smoothstep(front - feather, front + feather, position);
      for (let channel = 0; channel < 3; channel += 1) {
        const location = offset + channel;
        output.data[location] = mix(from.data[location], to.data[location], amount);
      }
      output.data[offset + 3] = alpha[point];
    }
    return output;
  }
  window.RoundedBlock = {
    palettes, clamp, mix, getBlockProjection, getBlockSilhouettePath, renderBlock, createSweepCache, getSweepColor,
    getSweepFrame, holdDuration, sweepDuration, easeSweep, shufflePalettes, createPaletteSweep,
    advancePaletteSweep,
  };
})();
