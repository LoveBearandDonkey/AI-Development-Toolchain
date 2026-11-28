(() => {
  const scenes = {text: '文本生成', video: '视频生成', throughput: '吞吐优化'};
  const deployments = {
    mixed: ['聚合', '同一组设备完成 Prefill 和 Decode，展示端到端候选。'],
    pd: ['PD 分离', '分别查看 Prefill 和 Decode 的示例配置与阶段吞吐。'],
    prefill: ['仅 Prefill', '关注首 token 时延和内存。'],
    decode: ['仅 Decode', '关注逐 token 时延和内存。']
  };
  const metrics = {
    qps: ['QPS', 'req/s'], ttft: ['TTFT', 'ms'], tpot: ['TPOT', 'ms/token'],
    memory: ['单元显存', 'GiB']
  };
  const precision = {
    BF16: [1, 1, 1], W8A8: [1.13, .88, .8], W8A8C8: [1.22, .79, .65], W4A8: [1.17, .83, .56]
  };
  const colors = {A: '#326fbd', B: '#0c927b', C: '#a16ac2'};
  const layers = {qwen32: 64, qwen8: 36, distill32: 64};
  let xKey = '';
  let chartScene = '';

  function defaultSimulation() {
    const common = () => ({mode: 'mixed', precision: 'BF16', prefix: 0,
      tp: [1, 2, 4, 8, 16], pp: [1], partitions: {}});
    return {text: common(), throughput: common(), video: {
      ...common(), videoModel: 'Wan2.2-T2V', resolution: '720p', frames: 81, steps: 30
    }};
  }

  function current() { return state.simulations[state.scenario]; }
  function isVideo() { return state.scenario === 'video'; }
  function phaseOnly() { return !isVideo() && ['prefill', 'decode'].includes(current().mode); }
  function activeMetrics() {
    return current().mode === 'prefill' ? ['ttft', 'memory']
      : current().mode === 'decode' ? ['tpot', 'memory'] : Object.keys(metrics);
  }
  function layerCount() { return isVideo() ? (current().videoModel.startsWith('Wan') ? 40 : 48) : layers[state.model]; }
  function candidateLabel(row) { return 'TP' + row.tp + ' × PP' + row.pp + ' × DP' + row.dp; }
  function scenarioLabel() { return scenes[state.scenario]; }
  function workload() {
    if (isVideo()) {
      const {resolution, frames, steps} = current();
      return {name: resolution + ' · ' + frames + ' 帧 · ' + steps + ' 步', resolution, frames, steps};
    }
    return state.load === 'custom' ? state.customLoad : LOADS[state.load];
  }

  function partitionText(pp) {
    const total = layerCount(), each = Math.floor(total / pp);
    return Array.from({length: pp}, (_, i) => each + Number(i < total % pp)).join(', ');
  }

  function combinations(n) {
    return current().pp.flatMap(pp => current().tp.filter(tp => n % (tp * pp) === 0)
      .map(tp => ({tp, pp, dp: n / (tp * pp), partition: (current().partitions[pp] || partitionText(pp))
        .split(',').map(Number)})));
  }

  function inputIssues() {
    const cfg = current();
    if (!cfg.tp.length || !cfg.pp.length) return ['请至少选择一个 TP 和一个 PP 搜索尺寸。'];
    for (const pp of cfg.pp) {
      const text = cfg.partitions[pp];
      if (!text) continue;
      const values = text.split(',').map(Number);
      if (values.length !== pp || values.some(value => !Number.isInteger(value) || value < 1) ||
          values.reduce((a, b) => a + b, 0) !== layerCount()) {
        return ['PP ' + pp + ' 请填写 ' + pp + ' 个正整数，用逗号分隔，层数合计 ' + layerCount() + '。'];
      }
    }
    if (activeSlots().length && activeSlots().every(slot => !combinations(count(slot)).length)) {
      return ['当前环境没有能容纳所选 TP × PP 的设备组合。'];
    }
    return [];
  }

  function parallelFields() {
    const cfg = current();
    $('parallel-choices').innerHTML = [['tp', [1, 2, 4, 8, 16]], ['pp', [1, 2, 4]]].map(([kind, choices]) =>
      '<div class="demo-choices"><span>' + kind.toUpperCase() + ' 搜索尺寸</span>' +
      choices.map(n => '<label><input type="checkbox" data-search="' + kind + '" value="' + n + '"' +
        (cfg[kind].includes(n) ? ' checked' : '') + '><span>' + n + '</span></label>').join('') + '</div>'
    ).join('');
    partitionFields();
  }

  function partitionFields() {
    $('pp-partitions').innerHTML = current().pp.filter(pp => pp > 1).map(pp =>
      '<div class="field demo-partition"><label for="pp-layers-' + pp + '">PP ' + pp + ' 层分配 <small>共 ' + layerCount() +
      ' 层，留空自动均分</small></label><input type="text" id="pp-layers-' + pp + '" data-partition="' + pp +
      '" placeholder="' + partitionText(pp) + '" value="' + esc(current().partitions[pp] || '') + '"></div>'
    ).join('');
  }

  function renderForm() {
    const cfg = current(), video = isVideo();
    document.querySelectorAll('[data-scenario]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.scenario === state.scenario)));
    $('deploy-field').hidden = $('prefix-field').hidden = video;
    $('text-workload').hidden = $('business-targets').hidden = video;
    $('video-workload').hidden = !video;
    $('deploy-mode').value = cfg.mode;
    $('deploy-hint').textContent = deployments[cfg.mode][1];
    $('sim-precision').value = cfg.precision;
    $('prefix-hit').value = cfg.prefix;
    $('prefix-hit').disabled = cfg.mode === 'decode';
    $('custom-workload').hidden = state.load !== 'custom';
    if (state.load === 'custom') {
      const load = workload();
      if (!video) $('custom-workload').textContent = '来自硬件画像 · 输入 ' + load.input +
        ' / 输出 ' + load.output + ' tokens · 并发 ' + load.concurrency;
    }
    document.querySelectorAll('[data-video-setting]').forEach(field => {
      if (video) field.value = cfg[field.dataset.videoSetting];
    });
    $('compare').textContent = video ? '运行视频生成示例' : state.scenario === 'text' ? '运行文本生成示例' : '搜索吞吐候选';
    document.querySelectorAll('#target-fields > .field').forEach(field => {
      field.hidden = !activeMetrics().includes(field.querySelector('input[type="number"]').id);
    });
    parallelFields();
    syncFormStatus();
  }

  function syncFormStatus() {
    $('parallel-status').textContent = inputIssues()[0] || 'DP 按每套环境的设备数和 TP × PP 推导。';
    $('prefix-value').value = current().mode === 'decode' ? '仅 Prefill 生效' : current().prefix + '%';
  }

  function bind() {
    document.querySelector('.demo-simulation').addEventListener('click', event => {
      const button = event.target.closest('[data-scenario]');
      if (!button || button.dataset.scenario === state.scenario) return;
      state.scenario = button.dataset.scenario;
      renderForm();
      markChanged();
    });
    document.querySelector('.demo-simulation').addEventListener('input', event => {
      const field = event.target, cfg = current();
      if (field.id === 'prefix-hit') cfg.prefix = Number(field.value);
      else if (field.id === 'sim-precision') cfg.precision = field.value;
      else if (field.id === 'deploy-mode') {
        cfg.mode = field.value;
        renderForm();
      } else if (field.dataset.search) {
        const key = field.dataset.search;
        cfg[key] = Array.from(document.querySelectorAll('[data-search="' + key + '"]:checked'), el => Number(el.value));
        if (key === 'pp') partitionFields();
      } else if (field.dataset.partition) cfg.partitions[field.dataset.partition] = field.value.trim();
      else return;
      markChanged();
    });
    $('model-select').addEventListener('change', partitionFields);
    $('video-workload').addEventListener('change', event => {
      const field = event.target, key = field.dataset.videoSetting;
      if (!key) return;
      current()[key] = ['frames', 'steps'].includes(key) ? Number(field.value) : field.value;
      if (key === 'videoModel') partitionFields();
      markChanged();
    });
    $('scatter').addEventListener('click', event => {
      const axis = event.target.closest('[data-axis]');
      const dot = event.target.closest('[data-dot]');
      if (axis) {
        xKey = axis.dataset.axis;
        renderScatter(rows());
        $('scatter').querySelector('[data-axis="' + xKey + '"]')?.focus();
      }
      if (dot) {
        selectCandidate(dot.dataset.dot);
        $('scatter').querySelector('[data-dot="' + dot.dataset.dot + '"]')?.focus();
      }
    });
    $('scatter').addEventListener('keydown', event => {
      if (event.target.matches('[data-dot]') && ['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        event.target.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      }
    });
    $('video-results').addEventListener('click', event => {
      const button = event.target.closest('[data-video-slot]');
      if (button) selectCandidate(button.dataset.videoSlot);
    });
  }

  function adjustBaseline(values, row) {
    const cfg = current(), load = workload();
    const [qps, ttft, tpot, memory] = values;
    const [speed, latency, footprint] = precision[cfg.precision];
    const layerShare = Math.max(...row.partition) / layerCount();
    const hit = cfg.mode === 'decode' ? 0 : cfg.prefix / 100;
    const modeScale = cfg.mode === 'pd' ? [1.16, .81, .89] : [1, 1, 1];
    return {
      qps: +(qps * speed * (1 + hit * .25) * modeScale[0] / (1 + (row.pp - 1) * .12)).toFixed(2),
      ttft: Math.round(ttft * latency * (1 - hit * .68) * modeScale[1] * (1 + (row.pp - 1) * .08)),
      tpot: +(tpot * latency * modeScale[2] * (1 + (row.pp - 1) * .10)).toFixed(1),
      memory: +(memory * footprint * (.24 + layerShare * .76) *
        (load.output > 512 ? 1.06 : 1)).toFixed(1)
    };
  }

  function summaryLabels() {
    const cfg = current();
    return [
      scenarioLabel(), modelName() + ' · ' + cfg.precision,
      ...(isVideo() ? [] : [deployments[cfg.mode][0], 'Prefix Cache ' + (cfg.mode === 'decode' ? '—' : cfg.prefix + '%')]),
      'TP ' + cfg.tp.join('/') + ' · PP ' + cfg.pp.join('/')
    ];
  }

  function renderScatter(list) {
    if (!list.length) return;
    const signature = state.scenario + current().mode;
    const horizontal = phaseOnly() ? activeMetrics().filter(key => key !== 'memory') : ['tpot', 'ttft'];
    if (chartScene !== signature || !horizontal.includes(xKey)) xKey = horizontal[0];
    chartScene = signature;
    const yKey = phaseOnly() ? 'memory' : 'qps';
    const [xLabel, xUnit] = metrics[xKey], [yLabel, yUnit] = metrics[yKey];
    const xMax = Math.max(state.targets[xKey], ...list.map(row => row.values[xKey])) * 1.12;
    const yMax = Math.max(state.targets[yKey], ...list.map(row => row.values[yKey])) * 1.18;
    const x = value => 70 + value / xMax * 642, y = value => 207 - value / yMax * 175;
    const xTarget = x(state.targets[xKey]), yTarget = y(state.targets[yKey]);
    const grid = [0, .25, .5, .75, 1].map(tick =>
      '<path d="M70 ' + y(yMax * tick) + 'H712" class="demo-gridline"/>' +
      '<text x="62" y="' + (y(yMax * tick) + 4) + '" text-anchor="end">' + fmt(yMax * tick, 1) + '</text>' +
      '<text x="' + x(xMax * tick) + '" y="225" text-anchor="middle">' + fmt(xMax * tick, 0) + '</text>'
    ).join('');
    const dots = [...list].sort((a,b) => Number(a.id === state.selected) - Number(b.id === state.selected)).map(row => {
      const selected = row.id === state.selected;
      const label = row.id + ' · ' + candidateLabel(row) + ' · ' + fmt(row.values[xKey]) + ' ' + xUnit +
        ' · ' + fmt(row.values[yKey], 2) + ' ' + yUnit + ' · ' + fmt(row.values.memory) + ' GiB · ' +
        row.source + ' · ' + (row.feasible ? '达标' : row.reasons.join('、'));
      return '<g data-dot="' + row.id + '" role="button" tabindex="0" aria-pressed="' + selected +
        '" aria-label="' + esc(label) + '" transform="translate(' + x(row.values[xKey]) + ' ' + y(row.values[yKey]) + ')">' +
        '<title>' + esc(label) + '</title><circle r="12" fill="transparent"/>' +
        (selected ? '<circle r="10" fill="none" stroke="' + colors[row.slot] + '" stroke-width="2"/>' : '') +
        '<circle r="6" fill="' + (row.feasible ? colors[row.slot] : '#fff') + '" stroke="' + colors[row.slot] + '" stroke-width="2"/></g>';
    }).join('');
    $('scatter').innerHTML = '<div class="demo-card-head"><h2>候选分布</h2><div class="demo-segmented">' +
      horizontal.map(key => '<button type="button" data-axis="' + key + '" aria-pressed="' + (key === xKey) + '">' +
        metrics[key][0] + '</button>').join('') + '</div></div>' +
      '<svg viewBox="0 0 742 252" class="demo-scatter" aria-label="' + yLabel + ' 与 ' + xLabel + ' 的候选分布">' +
      '<rect x="70" y="' + (phaseOnly() ? yTarget : 32) + '" width="' + (xTarget - 70) + '" height="' +
      (phaseOnly() ? 207 - yTarget : yTarget - 32) + '" fill="#eef8f2"/>' + grid +
      '<path d="M' + xTarget + ' 32V207M70 ' + yTarget + 'H712" class="demo-threshold"/>' +
      '<text x="70" y="18">' + yLabel + ' / ' + yUnit + '</text><text x="712" y="245" text-anchor="end">' +
      xLabel + ' / ' + xUnit + '</text>' + dots + '</svg><div class="demo-legend">' +
      activeSlots().map(slot => '<span><i style="--swatch:' + colors[slot] + '"></i>环境 ' + slot + '</span>').join('') +
      '<span>空心点 · 有约束未达标</span><span>虚线 · 业务门槛</span></div>';
  }

  function renderPD(row) {
    const panel = $('pd-results');
    panel.hidden = current().mode !== 'pd';
    if (panel.hidden || !row) return;
    const qps = row.baseline.qps, prefill = qps * 1.18;
    panel.innerHTML = '<h2>PD 分离 · ' + row.id + '</h2><div class="demo-kpis">' +
      [['Prefill', fmt(prefill, 2) + ' req/s', fmt(row.baseline.ttft) + ' ms TTFT'],
       ['Decode', fmt(qps, 2) + ' req/s', fmt(row.baseline.tpot) + ' ms/token TPOT'],
       ['示例 P:D 配比', '1 : 2', fmt(qps, 2) + ' req/s · 平衡吞吐']].map(([name, value, note]) =>
      '<div><span>' + name + '</span><strong>' + value + '</strong><small>' + note + '</small></div>').join('') + '</div>';
  }

  function videoStats(row) {
    const {steps, frames, resolution, videoModel} = current();
    const [speed,, footprint] = precision[current().precision];
    const load = frames / 81 * (resolution === '720p' ? 1 : .54);
    const hardware = {A: 1, B: 1.19, C: 1.48}[row.slot];
    const model = videoModel.startsWith('Wan') ? 1 : 1.19;
    const denoise = 70 * steps / 30 * load * hardware * model / (speed * Math.sqrt(row.tp * row.pp / 2));
    const phases = [['提示词编码', 1.8 * hardware], ['DiT 去噪', denoise], ['VAE 解码', 5.8 * load * hardware]];
    const duration = phases.reduce((sum, [, seconds]) => sum + seconds, 0);
    const memory = (46 * model * footprint / (row.tp * row.pp) + 11 * load);
    return {phases, duration, memory};
  }

  function renderVideo(list, row) {
    const {phases, duration, memory} = row.video;
    $('video-results').innerHTML = '<div class="demo-card-head"><h2>视频生成 · ' + row.id + '</h2><span>构造仿真结果</span></div>' +
      '<div class="demo-kpis">' + [['单视频生成耗时', fmt(duration) + ' s'], ['单元显存峰值', fmt(memory) + ' GiB'],
      ['并行配置', candidateLabel(row)]].map(([label, value]) => '<div><span>' + label + '</span><strong>' + value + '</strong></div>').join('') +
      '</div><div class="demo-video-grid"><div><h3>阶段耗时</h3>' + phases.map(([label, seconds]) =>
      '<div class="demo-time-row"><span>' + label + '</span><i style="--bar:' + seconds / duration * 100 +
      '%"></i><b>' + fmt(seconds) + ' s</b></div>').join('') + '</div><div><h3>切换候选</h3><div class="demo-video-cases">' +
      list.map(item => '<button type="button" data-video-slot="' + item.id + '" aria-pressed="' + (item.id === row.id) + '">' +
        item.id + ' · ' + candidateLabel(item) + '<small>' + esc(environmentName(item.slot)) + ' · ' +
        fmt(item.video.duration) + ' s</small></button>').join('') +
      '</div></div></div>' + window.demoCharts.memoryBar([['模型权重', memory * .53], ['潜变量与中间张量', memory * .28],
        ['VAE 激活', memory * .12], ['预留', memory * .07]], row.capacity);
  }

  function renderResult(list) {
    const row = chosen();
    const video = isVideo(), phase = phaseOnly();
    $('result-task').innerHTML = [...summaryLabels(), workload().name, '构造仿真'].map(value =>
      '<span>' + esc(value) + '</span>').join('');
    $('search-loading').querySelector('strong').textContent = '正在准备' + scenarioLabel() + '示例';
    $('text-results').hidden = video;
    $('single-point').hidden = video;
    $('video-results').hidden = !video;
    $('export-selected-plan').hidden = video;
    $('full-request-actions').hidden = phase;
    $('phase-note').hidden = !phase;
    $('text-results').dataset.deploy = current().mode;
    if (!row || !canExportPlans()) return;
    if (video) renderVideo(list, row);
    else {
      renderScatter(list);
      renderPD(row);
    }
  }

  window.simulationDemo = {activeMetrics, adjustBaseline, bind, candidateLabel, combinations, current,
    defaultSimulation, inputIssues, isVideo, partitionFields, phaseOnly, renderForm, renderResult,
    summaryLabels, syncFormStatus, videoStats, workload};
})();
