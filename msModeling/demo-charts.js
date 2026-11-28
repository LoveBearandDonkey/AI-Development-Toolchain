(() => {
  const memoryColors = ['#4978bb', '#62a6c9', '#9b8ac6', '#85a18c', '#e4e9f0'];

  function memoryBar(parts, capacity) {
    const used = parts.reduce((sum, [, value]) => sum + value, 0);
    const total = Math.max(capacity, used);
    const fmt = value => value.toLocaleString('zh-CN', {maximumFractionDigits: 1});
    const entries = [...parts.map(([name, value], i) => [name, value, memoryColors[i]]),
      ['剩余', Math.max(0, capacity - used), memoryColors[4]]];
    const legend = entries.map(([name, value, color]) =>
      `<span><i style="--swatch:${color}"></i>${name} <b>${fmt(value)} GiB</b></span>`).join('');
    const bar = entries.map(([, value, color]) =>
      `<i style="width:${100 * value / total}%;background:${color}"></i>`).join('');
    return `<div class="demo-memory"><div class="demo-card-head"><strong>单元显存构成</strong>
      <span>${fmt(used)} / ${fmt(capacity)} GiB${used > capacity ? ' · 超出容量' : ''}</span></div>
      <div class="demo-memory-bar" aria-hidden="true">${bar}${used > capacity ? `<em style="left:${100 * capacity / total}%"></em>` : ''}</div>
      <div class="demo-legend">${legend}</div></div>`;
  }

  window.demoCharts = {memoryBar};
})();
