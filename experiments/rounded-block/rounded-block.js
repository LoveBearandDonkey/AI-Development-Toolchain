const { palettes, clamp, renderBlock, createSweepCache, getSweepColor, getSweepFrame,
  holdDuration, sweepDuration, shufflePalettes, createPaletteSweep, advancePaletteSweep } = window.RoundedBlock;
const { shape: avatarShape, material: avatarMaterial } = window.CATALOG_AVATAR_CONFIG;
const modelScale = 0.01;
const defaultPalette = 'dynamic';
const defaultSettings = {
  length: avatarShape.height * (avatarShape.minWidthRatio + avatarShape.maxWidthRatio) / 2 * modelScale,
  width: avatarShape.depth * modelScale,
  height: avatarShape.height * modelScale,
  rounding: avatarShape.rounding,
  yaw: avatarShape.restYaw * 180 / Math.PI,
  pitch: avatarShape.restPitch * 180 / Math.PI,
  softness: avatarMaterial.softness,
  rim: avatarMaterial.rim,
  rimDepth: avatarMaterial.rimDepth,
};

const preview = document.querySelector('#preview');
const previewZoom = 1.7;
const referenceWidth = preview.width;
const referenceHeight = preview.height;
const exportWidth = referenceWidth * 2;
const exportHeight = referenceHeight * 2;
const presets = [...document.querySelectorAll('[data-palette]')];
const paletteChoices = new Map(presets
  .filter((preset) => Object.hasOwn(palettes, preset.dataset.palette))
  .map((preset) => [preset.dataset.palette, {
    name: preset.textContent.trim(),
    swatch: preset.style.getPropertyValue('--swatch'),
  }]));
const mixOptions = document.querySelector('#mix-options');
const mixColors = document.querySelector('#mix-colors');
const mixHint = document.querySelector('#mix-hint');
const rerollMix = document.querySelector('#reroll-mix');
const mixSwatches = new Map(Array.from(paletteChoices, ([id, color]) => {
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'mix-swatch';
  swatch.dataset.color = id;
  swatch.style.setProperty('--swatch', color.swatch);
  swatch.setAttribute('aria-label', color.name);
  return [id, swatch];
}));
const poses = [...document.querySelectorAll('input[name="pose"]')];
const longSideLabel = document.querySelector('label[for="length"]');
const controls = [...document.querySelectorAll('input[type="range"]')];
const download = document.querySelector('#download');
const status = document.querySelector('#render-status');
const defaultStatus = status.textContent;
let selectedPalette;
let selectedMixColors = new Set();
let mixOrder = [...paletteChoices.keys()];
let swatchDrag;
let suppressSwatchClick = false;
let pendingFrame;
let playback;
let displayPixelWidth = referenceWidth;
let refinementTimer;
let previewVisible = true;

function readSettings() {
  const settings = {
    palette: selectedPalette,
    mixedPalettes: mixOrder.filter((id) => selectedMixColors.has(id)),
    pose: poses.find((input) => input.checked).value,
  };
  for (const control of controls) settings[control.id] = control.valueAsNumber;
  return settings;
}

function randomPalettes(count) {
  return shufflePalettes(paletteChoices.keys()).slice(0, count);
}

function selectPalette(id) {
  if (id === selectedPalette) return;

  clearTimeout(playback?.holdTimer);
  playback = undefined;
  selectedPalette = id;
  if (id === 'dynamic') {
    playback = createPaletteSweep([...paletteChoices.keys()]);
  }
}

function queuePreview() {
  if (previewVisible) pendingFrame ??= requestAnimationFrame(drawPreview);
}

function measurePreview() {
  const pixels = preview.getBoundingClientRect().width * window.devicePixelRatio;
  if (pixels === 0) return;

  const width = Math.min(exportWidth, Math.ceil(pixels / 8) * 8);
  if (width === displayPixelWidth) return;

  displayPixelWidth = width;
  queuePreview();
}

function watchPixelRatio() {
  const current = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  current.addEventListener('change', () => {
    measurePreview();
    watchPixelRatio();
  }, { once: true });
}

function updatePreviewResolution() {
  const width = refinementTimer === undefined ? displayPixelWidth : Math.min(referenceWidth, displayPixelWidth);
  const scale = width / referenceWidth;
  if (width !== preview.width) {
    preview.width = width;
    preview.height = referenceHeight * scale;
    if (playback) playback.cache = undefined;
  }
  return scale;
}

function holdCurrentColor(state) {
  state.holdTimer = setTimeout(() => {
    state.holdTimer = undefined;
    state.startedAt = performance.now();
    queuePreview();
  }, holdDuration);
}

function drawPreview(timestamp) {
  pendingFrame = undefined;
  const resolutionScale = updatePreviewResolution();
  const settings = { ...readSettings(), viewZoom: previewZoom };
  if (!playback) {
    renderBlock(preview, settings, resolutionScale);
    return;
  }

  const cache = playback.cache ??= createSweepCache(preview);
  if (playback.startedAt !== undefined) {
    playback.progress = clamp((timestamp - playback.startedAt) / sweepDuration);
  }
  const frame = getSweepFrame(preview, settings, playback, cache, resolutionScale);
  preview.getContext('2d').putImageData(frame, 0, 0);

  if (playback.startedAt === undefined) {
    if (playback.holdTimer === undefined) holdCurrentColor(playback);
    // Prepare the next color during the hold to keep the sweep lightweight.
    getSweepColor(preview, settings, cache, playback.next, resolutionScale);
    return;
  }
  if (playback.progress >= 1) {
    advancePaletteSweep(playback);
    playback.startedAt = undefined;
    holdCurrentColor(playback);
  }
  queuePreview();
}

function setMixedPalettes(ids) {
  selectedMixColors = new Set(ids);
  mixOrder = [...ids, ...[...paletteChoices.keys()].filter((id) => !selectedMixColors.has(id))];
  mixColors.append(...mixOrder.map((id) => mixSwatches.get(id)));
  for (const [id, swatch] of mixSwatches) swatch.setAttribute('aria-pressed', selectedMixColors.has(id));
}

function moveMixColor(id, destination) {
  const index = mixOrder.indexOf(id);
  if (index === destination) return;

  mixOrder.splice(index, 1);
  mixOrder.splice(destination, 0, id);
  mixColors.insertBefore(mixSwatches.get(id), mixSwatches.get(mixOrder[destination + 1]) ?? null);
  updatePreview();
}

function updatePreview() {
  const upright = poses.find((input) => input.checked).value === 'high';
  longSideLabel.textContent = upright ? '高度' : '长度';
  const direction = upright ? '底端到顶端' : '近端到远端';
  mixHint.textContent = `至少选 2 色，颜色从${direction}排列。拖动色圈或按住 Shift 加左右方向键调整顺序。`;
  for (const control of controls) {
    const value = control.valueAsNumber;
    const unit = control.dataset.unit ?? '';
    const displayValue = unit === '%' ? Math.round(value * 100) : value.toFixed(Number(control.dataset.precision ?? 0));
    control.previousElementSibling.value = `${displayValue}${unit}`;
  }
  for (const preset of presets) preset.setAttribute('aria-pressed', preset.dataset.palette === selectedPalette);
  mixOptions.hidden = selectedPalette !== 'mixed';
  rerollMix.hidden = mixOptions.hidden;
  if (playback) playback.cache = undefined;
  measurePreview();
  queuePreview();
}

for (const preset of presets) {
  preset.addEventListener('click', () => {
    selectPalette(preset.dataset.palette);
    if (selectedPalette === 'mixed' && selectedMixColors.size === 0) setMixedPalettes(randomPalettes(3));
    updatePreview();
  });
}

function toggleMixSwatch(swatch) {
  const { color } = swatch.dataset;
  if (selectedMixColors.has(color)) {
    if (selectedMixColors.size <= 2) return;
    selectedMixColors.delete(color);
  } else {
    selectedMixColors.add(color);
  }
  swatch.setAttribute('aria-pressed', selectedMixColors.has(color));
  updatePreview();
}

mixColors.addEventListener('click', (event) => {
  const swatch = event.target.closest('button[data-color]');
  if (!swatch || (event.detail > 0 && (suppressSwatchClick || event.pointerType === 'touch'))) return;

  toggleMixSwatch(swatch);
});

mixColors.addEventListener('pointerdown', (event) => {
  const swatch = event.target.closest('button[data-color]');
  if (!swatch || event.button !== 0 || !event.isPrimary || swatchDrag) return;

  suppressSwatchClick = false;
  const [first, second] = mixColors.children;
  swatchDrag = {
    swatch,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startIndex: mixOrder.indexOf(swatch.dataset.color),
    spacing: second.getBoundingClientRect().left - first.getBoundingClientRect().left,
    active: false,
  };
});

function placeDraggedSwatch(clientX) {
  const { swatch, startX, startIndex, spacing } = swatchDrag;
  const position = clamp(startIndex + (clientX - startX) / spacing, 0, mixOrder.length - 1);
  const destination = Math.round(position);
  moveMixColor(swatch.dataset.color, destination);
  swatch.style.setProperty('--drag-offset', `${(position - destination) * spacing}px`);
}

window.addEventListener('pointermove', (event) => {
  if (event.pointerId !== swatchDrag?.pointerId) return;
  if (event.buttons === 0) {
    finishSwatchDrag(event);
    return;
  }

  if (!swatchDrag.active) {
    if (Math.abs(event.clientX - swatchDrag.startX) < 5) return;
    swatchDrag.active = true;
    swatchDrag.swatch.dataset.dragging = '';
    // Capture on the row so moving a swatch does not interrupt pointer delivery.
    mixColors.setPointerCapture(event.pointerId);
  }
  placeDraggedSwatch(event.clientX);
});

function finishSwatchDrag(event) {
  if (event.pointerId !== swatchDrag?.pointerId) return;

  if (swatchDrag.active) {
    if (event.type === 'pointerup') placeDraggedSwatch(event.clientX);
    suppressSwatchClick = true;
    delete swatchDrag.swatch.dataset.dragging;
    swatchDrag.swatch.style.removeProperty('--drag-offset');
  } else if (event.type === 'pointerup' && event.pointerType === 'touch'
    && Math.abs(event.clientX - swatchDrag.startX) < 5 && Math.abs(event.clientY - swatchDrag.startY) < 8) {
    suppressSwatchClick = true;
    toggleMixSwatch(swatchDrag.swatch);
  }
  swatchDrag = undefined;
}

window.addEventListener('pointerup', finishSwatchDrag);
window.addEventListener('pointercancel', finishSwatchDrag);

mixColors.addEventListener('keydown', (event) => {
  const swatch = event.target.closest('button[data-color]');
  if (!swatch || !event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;

  event.preventDefault();
  const { color } = swatch.dataset;
  const step = event.key === 'ArrowLeft' ? -1 : 1;
  moveMixColor(color, clamp(mixOrder.indexOf(color) + step, 0, mixOrder.length - 1));
  swatch.focus({ preventScroll: true });
});

rerollMix.addEventListener('click', () => {
  const current = mixOrder.filter((id) => selectedMixColors.has(id));
  const next = randomPalettes(current.length);
  if (next.every((id, index) => id === current[index])) next.push(next.shift());
  setMixedPalettes(next);
  updatePreview();
});

for (const control of controls) {
  const precision = Number(control.dataset.precision ?? (control.dataset.unit === '%' ? 2 : 0));
  control.defaultValue = defaultSettings[control.id].toFixed(precision);
  control.value = control.defaultValue;
  control.addEventListener('input', () => {
    clearTimeout(refinementTimer);
    refinementTimer = setTimeout(() => {
      refinementTimer = undefined;
      queuePreview();
    }, 160);
    updatePreview();
  });
}
for (const pose of poses) pose.addEventListener('change', updatePreview);

document.querySelector('#reset').addEventListener('click', () => {
  selectPalette(defaultPalette);
  setMixedPalettes([]);
  for (const control of controls) control.value = control.defaultValue;
  for (const pose of poses) pose.checked = pose.defaultChecked;
  updatePreview();
});

download.addEventListener('click', () => {
  const settings = readSettings();
  const sweep = playback && { current: playback.current, next: playback.next, progress: playback.progress };
  download.disabled = true;
  status.textContent = '正在生成 PNG…';
  // Let the browser paint the status before drawing the full-size export.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const canvas = document.createElement('canvas');
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const resolutionScale = exportWidth / referenceWidth;
    if (sweep) {
      const frame = getSweepFrame(canvas, settings, sweep, createSweepCache(canvas), resolutionScale);
      canvas.getContext('2d').putImageData(frame, 0, 0);
    } else {
      renderBlock(canvas, settings, resolutionScale);
    }
    canvas.toBlob((blob) => {
      download.disabled = false;
      if (!blob) {
        status.textContent = 'PNG 生成失败，请重试。';
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const poseSuffix = settings.pose === 'high' ? '-upright' : '';
      link.download = `rounded-block-${settings.palette}${poseSuffix}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = defaultStatus;
    }, 'image/png');
  }));
});

new ResizeObserver(measurePreview).observe(preview, { box: 'device-pixel-content-box' });
new IntersectionObserver(([entry]) => {
  previewVisible = entry.isIntersecting;
  if (previewVisible) queuePreview();
  else {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = undefined;
  }
}).observe(preview);
window.addEventListener('resize', measurePreview);
watchPixelRatio();
selectPalette(defaultPalette);
updatePreview();
