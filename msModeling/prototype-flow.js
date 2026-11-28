(() => {
  'use strict';

  const metrics = {
    qps: ['QPS', 'req/s'],
    ttft: ['平均 TTFT', 'ms'],
    tpot: ['平均 TPOT', 'ms/token'],
    memory: ['单元内存峰值', 'GiB']
  };
  const metricKeys = Object.keys(metrics);
  const empty = '<p class="subtle">填写搜索范围后，可查看示例参数和对比指标。</p>';
  let loadedExample = null;
  let singleOpen = false;
  let diagnosticScene = '';
  let servingScope = '';

  function chips(target, values) {
    $(target).innerHTML = values.map(value => '<span>' + esc(value) + '</span>').join('');
  }

  function taskLabels(row) {
    const load = sim.workload();
    if (sim.isVideo()) return [...sim.summaryLabels(), load.name];
    return [
      ...sim.summaryLabels(),
      load.name + ' · ' + load.input + '/' + load.output + ' tokens · 并发 ' + load.concurrency,
      ...sim.activeMetrics().map(key => metrics[key][0] + (key === 'qps' ? ' ≥ ' : ' ≤ ') + metricValue(key, state.targets[key])),
      ...(row ? [row.id + ' · ' + environmentName(row.slot) + ' · ' + sim.candidateLabel(row)] : [])
    ];
  }

  function metricValue(key, value) {
    return fmt(value, key === 'qps' ? 2 : 1) + ' ' + metrics[key][1];
  }

  function metricLimit(row, key) {
    return key === 'memory' ? Math.min(row.capacity, state.targets.memory) : state.targets[key];
  }

  function aboveOrBelow(row, values, key) {
    return key === 'qps' ? values[key] < metricLimit(row, key) : values[key] > metricLimit(row, key);
  }

  function currentTuning(row = chosen()) {
    return row && state.tuningResult?.scope === row.scope ? state.tuningResult : null;
  }

  function tuningLabel(tuning) {
    return tuning.parameters.engine + ' · ' + tuning.parameters.benchmark + ' · 并发上限 ' + tuning.parameters.concurrencyLimit;
  }

  function verificationCandidate() {
    const row = chosen();
    const tuning = state.retestSource === 'tuned' ? currentTuning(row) : null;
    if (!row || !tuning) return row;
    const scope = JSON.stringify([row.scope, tuning.parameters]);
    const point = state.points[scope] || null;
    const values = point?.values || tuning.values;
    const failed = Object.fromEntries(metricKeys.map(key => [key, aboveOrBelow(row, values, key)]));
    const reasons = metricKeys.filter(key => failed[key]).map(key => metrics[key][0] + ' 未达目标');
    const margins = Object.fromEntries(metricKeys.map(key => {
      const limit = metricLimit(row, key);
      return [key, (key === 'qps' ? values[key] - limit : limit - values[key]) / limit];
    }));
    return {
      ...row, scope, tuning, point, values, failed, reasons, margins,
      source: point?.source === 'manual' ? '手工录入点' : point ? '示例测量点' : '寻优示例',
      score: Object.values(margins).reduce((sum, value) => sum + value, 0) / 4 * 100,
      feasible: reasons.length === 0
    };
  }

  function showSingle() {
    const row = chosen();
    if (!row || !canExportPlans()) return;
    const load = sim.workload(), used = row.baseline.memory;
    const kv = used * Math.min(.54, .20 + Math.log2(Math.max(1, load.input / 2048)) * .09);
    const memory = window.demoCharts.memoryBar([['权重', used * .85 - kv], ['KV Cache', kv],
      ['激活', used * .09], ['预留', used * .06]], row.capacity);
    const matmul = 39 - Math.min(12, Math.log2(row.tp) * 3);
    const attention = 21 + Math.min(11, Math.log2(Math.max(1, load.input / 2048)) * 4);
    const communication = 9 + Math.log2(row.tp) * 5 + (row.pp - 1) * 2;
    const hotspots = [['MatMul', '计算', matmul], ['Attention / KV Cache', '访存', attention],
      ['AllReduce / P2P', '通信', communication], ['其余算子', '混合', 100 - matmul - attention - communication]]
      .sort((a, b) => b[2] - a[2]);
    const panel = $('single-output');
    panel.hidden = false;
    panel.innerHTML = '<h3>' + row.id + ' · ' + esc(sim.candidateLabel(row)) + '</h3><p class="subtle">' +
      esc(modelName() + ' · ' + sim.current().precision + ' · ' + load.input + '/' + load.output + ' tokens · 并发 ' + load.concurrency) +
      ' · 构造仿真</p><div class="demo-diagnosis">' + memory + '<div><h3>算子耗时占比</h3>' +
      hotspots.map(([name, bound, share]) => '<div class="demo-time-row"><span>' + name + '<small>' + bound +
      '</small></span><i style="--bar:' + share + '%"></i><b>' + share + '%</b></div>').join('') + '</div></div>';
  }

  function showServing() {
    const row = chosen();
    if (!row || !canExportPlans()) return;
    servingScope = row.scope;
    const wait = Math.round(row.baseline.ttft * .18);
    $('serving-output').hidden = false;
    $('serving-output').innerHTML =
      '<h3>示例交付 · 细粒度服务仿真</h3><p>沿用 ' + esc(row.id + ' · ' + sim.workload().name) +
      '，示意对同一实例布局发出多个请求时的响应。</p>' +
      '<table><thead><tr><th>指标</th><th>示例值</th></tr></thead><tbody>' +
      '<tr><td>接纳等待</td><td>' + fmt(wait) + ' ms</td></tr><tr><td>客户端 TTFT</td><td>' +
      fmt(row.baseline.ttft + wait) + ' ms</td></tr><tr><td>请求吞吐</td><td>' +
      metricValue('qps', row.baseline.qps) + '</td></tr></tbody></table>' +
      '<p class="subtle">下一步可用本候选进入实机寻优，也可直接复测。</p>';
  }

  function tuningTable(result) {
    const title = result.feasible ? '示例推荐' : '当前较优示例';
    const note = result.feasible
      ? '示例指标达到目标，可把此参数带到同负载复测。'
      : '本轮没有示例组合达到全部目标。可调整范围，或带当前参数去复测。';
    return '<h3>' + title + ' · ' + esc(tuningLabel(result)) + '</h3>' +
      '<p class="subtle">' + note + ' 下表为构造数据。</p><div class="flow-preview flow-table-scroll">' +
      '<table><thead><tr><th>并发上限</th><th>QPS</th><th>TTFT</th><th>TPOT</th><th>单元内存</th><th>目标</th></tr></thead><tbody>' +
      result.trials.map(trial => '<tr><td>' + trial.limit + (trial.limit === result.parameters.concurrencyLimit ? ' · 已选' : '') +
        '</td>' + metricKeys.map(key => '<td>' + metricValue(key, trial.values[key]) + '</td>').join('') +
        '<td>' + (trial.feasible ? '达标' : '未达标') + '</td></tr>').join('') + '</tbody></table></div>';
  }

  function renderTuning(row) {
    if (!row) return;
    chips('tuning-task', taskLabels(row));
    const result = currentTuning(row);
    if (result) {
      $('tuning-engine').value = result.parameters.engine;
      $('tuning-benchmark').value = result.parameters.benchmark;
      $('tuning-min').value = result.range[0];
      $('tuning-max').value = result.range[1];
    }
    $('tuning-output').innerHTML = result ? tuningTable(result) : empty;
    $('export-tuning').disabled = $('use-tuning').disabled = !result;
    $('tuning-status').textContent = '';
  }

  function runTuning() {
    const row = chosen();
    if (!row) return;
    const min = Number($('tuning-min').value), max = Number($('tuning-max').value);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      $('tuning-status').textContent = '请输入有效的正整数范围，结束值需大于或等于起点。';
      return;
    }
    const middle = Math.round(min + (max - min) * .5), baseline = row.baseline;
    const trials = [...new Set([min,middle,max])].map(limit => {
      const pressure = (limit - middle) / Math.max(max - min,1);
      const values = {
        qps:baseline.qps * (1.12 - Math.abs(pressure) * .15),
        ttft:baseline.ttft * (.92 + pressure * .22),
        tpot:baseline.tpot * (.95 + pressure * .12),
        memory:baseline.memory * (1.02 + pressure * .10)
      };
      const misses = metricKeys.filter(key => aboveOrBelow(row, values, key)).length;
      return {limit, values, misses, feasible:misses === 0};
    });
    const recommendation = [...trials].sort((a,b) => a.misses - b.misses || b.values.qps - a.values.qps)[0];
    const parameters = {
      engine:$('tuning-engine').value,
      benchmark:$('tuning-benchmark').value,
      concurrencyLimit:recommendation.limit
    };
    state.tuningResult = {
      source:'example', candidate:row.id, scope:row.scope, task:taskLabels(row), range:[min,max], parameters,
      baseline, values:recommendation.values, feasible:recommendation.feasible, trials
    };
    renderTuning(row);
  }

  function openRetest(source) {
    state.retestSource = source === 'tuned' && currentTuning() ? 'tuned' : 'candidate';
    loadedExample = null;
    go(5);
  }

  function loadBaseline(baseline) {
    $('baseline-run').value = baseline?.runId || '';
    for (const key of metricKeys) $('baseline-'+key).value = baseline?.values[key] ?? '';
  }

  function loadRetestExample(passes) {
    const row = verificationCandidate();
    if (!row || state.measurementSource !== 'example') return;
    const values = Object.fromEntries(metricKeys.map(key => {
      const limit = metricLimit(row, key);
      return [key, limit * (key === 'qps' ? 1.12 : .86)];
    }));
    if (!passes) values.ttft = state.targets.ttft * 1.25;
    loadedExample = {scope:row.scope, values, runId:'EXAMPLE-' + row.id + (passes ? '-PASS' : '-RETRY')};
    $('measurement-run').value = loadedExample.runId;
    for (const key of metricKeys) $('measure-'+key).value = values[key];
    $('measurement-status').textContent = '已填入示例，点击「应用验证结果」查看结果。';
  }

  function readMetrics(prefix) {
    return Object.fromEntries(metricKeys.map(key => [key, Number($(prefix+'-'+key).value)]));
  }

  function applyRetest() {
    const row = verificationCandidate();
    if (!row) return;
    const source = state.measurementSource, runId = $('measurement-run').value.trim(), values = readMetrics('measure');
    const positive = value => Number.isFinite(value) && value > 0;
    const issues = [];
    if (!runId) issues.push('请填写复测运行 ID。');
    if (!Object.values(values).every(positive)) issues.push('请为四项复测指标填写正数。');
    let baseline;
    if (source === 'manual') {
      baseline = {runId:$('baseline-run').value.trim(), values:readMetrics('baseline')};
      if (!baseline.runId || baseline.runId === runId) issues.push('请填写与复测不同的基线运行 ID。');
      if (!Object.values(baseline.values).every(positive)) issues.push('请为四项基线指标填写正数。');
    } else if (loadedExample?.scope !== row.scope || loadedExample.runId !== runId ||
               metricKeys.some(key => loadedExample.values[key] !== values[key])) {
      issues.push('请先载入达标或未达标示例。');
    }
    $('measurement-error').hidden = !issues.length;
    $('measurement-error').textContent = issues.join(' ');
    if (issues.length) return;
    state.points[row.scope] = {scope:row.scope, candidate:row.id, source, runId, values, baseline, verified:false};
    if (state.finalized?.scope === row.scope) state.finalized = null;
    $('measurement-status').textContent = '已应用复测记录 ' + runId + '。';
    renderChart();
  }

  function renderAcceptance(row) {
    const confirmed = state.finalized?.scope === row.scope && state.finalized.runId === row.point?.runId;
    $('accept-actions').innerHTML = !row.point ? '' : row.feasible
      ? '<button class="primary" id="accept-plan">'+(confirmed?'下载已选方案':'保留这套方案')+'</button>'
      : '<button class="secondary" data-view="3">返回仿真换候选</button><button class="secondary" data-view="4">返回实机寻优</button>';
    $('accept-status').textContent = confirmed ? '已保留 '+row.id+' · '+(row.point.source==='example'?'示例结论':'用户录入结论') : '';
  }

  function saveAccepted() {
    const row = verificationCandidate();
    if (!row?.point || !row.feasible) return;
    state.finalized = {scope:row.scope, runId:row.point.runId, candidate:row.id, source:row.point.source};
    saveJson('已选部署方案-'+row.id+'.json', {
      status:'selected', task:taskLabels(row), plan:plan(row), measurement:row.point, selection:state.finalized
    });
    renderAcceptance(row);
  }

  function syncTask() {
    chips('draft-task', taskLabels());
  }

  function sync() {
    const row = chosen();
    if (state.step === 1) syncTask();
    if (state.step === 2 && !sim.isVideo()) {
      if (diagnosticScene !== state.scenario) {
        diagnosticScene = state.scenario;
        singleOpen = state.scenario === 'text';
      }
      $('candidate-routes').hidden = !row || !canExportPlans();
      $('single-output').hidden = !row || !singleOpen || !canExportPlans();
      $('serving-output').hidden = !row || servingScope !== row.scope;
      $('preview-single').disabled = !canExportPlans();
      $('preview-single').textContent = singleOpen ? '收起单点诊断' : '展开单点诊断';
      $('preview-single').setAttribute('aria-expanded', String(singleOpen && canExportPlans()));
      if (!$('single-output').hidden) showSingle();
      if (row) chips('candidate-task', taskLabels(row));
    }
    if (state.step === 4) renderTuning(row);
    if (state.step === 5 && row) chips('verification-task', taskLabels(row));
  }

  function navigate(step) {
    if (step === 2) {
      const slot = chosen()?.slot || activeSlots()[0];
      if (slot && !inputIssues().length) editEnvironment(slot);
      else notify('请先补全有效的模型任务和至少一套目标环境。');
      return;
    }
    if (step === 5 && canExportPlans() && !sim.isVideo() && !sim.phaseOnly()) {
      openRetest(state.retestSource === 'tuned' ? 'tuned' : 'candidate');
      return;
    }
    go(step === 3 ? 2 : step);
  }

  window.prototypeFlow = {
    sync, syncTask, openRetest, verificationCandidate, tuningLabel,
    loadRetestExample, loadBaseline, applyRetest, renderAcceptance
  };

  document.querySelector('.flow-tabs').addEventListener('click', event => {
    const link = event.target.closest('[data-flow-step]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(Number(link.dataset.flowStep));
  });
  $('to-hardware').addEventListener('click', () => navigate(2));
  $('preview-single').addEventListener('click', () => { singleOpen = !singleOpen; sync(); });
  $('preview-serving').addEventListener('click', showServing);
  $('run-tuning-example').addEventListener('click', runTuning);
  $('use-tuning').addEventListener('click', () => openRetest('tuned'));
  $('export-tuning').addEventListener('click', () => {
    const result = currentTuning();
    if (result) saveJson('示例寻优-'+result.candidate+'.json', result);
  });
  $('save-planning').addEventListener('click', () => {
    const row = chosen();
    if (row) {
      saveJson('部署规划-'+row.id+'.json', {...plan(row), kind:'deployment_planning_example', status:'planning_saved'});
      notify('已保存 '+row.id+' 的部署规划示例。');
    }
  });
  $('view-4').addEventListener('input', event => {
    if (!event.target.id.startsWith('tuning-')) return;
    if (state.tuningResult?.scope === chosen()?.scope) state.tuningResult = null;
    $('tuning-output').innerHTML = empty;
    $('export-tuning').disabled = $('use-tuning').disabled = true;
    $('tuning-status').textContent = '';
    const engine = $('tuning-engine').value, bench = $('tuning-benchmark');
    bench.options[1].disabled = engine !== 'vLLM';
    if (bench.selectedOptions[0].disabled) bench.selectedIndex = 0;
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-view],[data-review],#accept-plan');
    if (!button) return;
    if (button.id === 'accept-plan') saveAccepted();
    else if (button.dataset.review) openRetest(button.dataset.review);
    else navigate(Number(button.dataset.view));
  });

  const direct = Number(new URLSearchParams(location.hash.slice(1)).get('flow'));
  sync();
  const initial = handoffStep !== 1 ? handoffStep : direct;
  if ([3,4,5].includes(initial)) navigate(initial);
})();
