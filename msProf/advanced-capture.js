(() => {
  const panel = document.getElementById('advanced-content');
  const byId = id => document.getElementById(id);
  const get = name => byId('advanced-' + name);
  const tabs = [...panel.querySelectorAll('.advanced-tabs [role="tab"]')];

  function selectTab(selected) {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      byId(tab.getAttribute('aria-controls')).hidden = !active;
    }
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = tabs[1 - tabs.indexOf(tab)];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs.at(-1);
      if (!next) return;
      event.preventDefault();
      selectTab(next);
      next.focus();
    });
  }

  const copyButtons = [...panel.querySelectorAll('[data-advanced-copy]')];
  for (const button of copyButtons) {
    button.addEventListener('click', async () => {
      const target = byId(button.dataset.advancedCopy);
      try {
        await navigator.clipboard.writeText(target.textContent);
        notify('已复制' + (target === get('torch-code') ? '代码' : '命令'));
      } catch {
        const range = document.createRange();
        range.selectNodeContents(target);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        notify('已选中文本，可手动复制');
      }
    });
  }

  function showCode(name, content, valid) {
    const code = get(name);
    code.textContent = content;
    window.Prism?.highlightElement(code);
    copyButtons.find(button => button.dataset.advancedCopy === code.id).disabled = !valid;
  }

  function showError(name, message) {
    const element = get(name);
    element.hidden = !message;
    element.textContent = message;
  }

  const choices = new Map();
  for (const field of panel.querySelectorAll('[data-advanced-choices]')) {
    const select = field.querySelector('select');
    const group = document.createElement('div');
    group.className = 'scene-choice-grid advanced-choice-grid';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', select.getAttribute('aria-label'));
    group.style.setProperty('--scene-columns', select.options.length);
    const buttons = [...select.options].map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scene-choice';
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => {
        if (option.value === select.value) return;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      group.append(button);
      return button;
    });
    group.addEventListener('keydown', event => {
      const index = buttons.indexOf(document.activeElement);
      if (index < 0 || select.disabled) return;
      const offsets = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
      let next = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : null;
      if (Object.hasOwn(offsets, event.key)) next = buttons[(index + offsets[event.key] + buttons.length) % buttons.length];
      if (!next) return;
      event.preventDefault();
      next.click();
      next.focus();
    });
    select.hidden = true;
    select.after(group);
    choices.set(select, buttons);
  }

  function syncChoices() {
    for (const [select, buttons] of choices) {
      buttons.forEach((button, index) => {
        const option = select.options[index];
        const selected = option.value === select.value;
        button.textContent = option.textContent;
        button.disabled = select.disabled;
        button.tabIndex = selected && !select.disabled ? 0 : -1;
        button.setAttribute('aria-checked', String(selected));
      });
    }
  }

  const scenarios = {
    train: {
      title: '训练进度', initialElapsed: 3772, initialWork: 3980, epochs: 3, epochSteps: 2000,
      goals: ['采稳态基线', '排查慢 Rank'],
      guide: '先对照同一作业的 Rank 与 NPU，再比较同一观测段的单步计算耗时。',
      count: '本例 3 个进程，1 个 torchrun 启动器 + 2 个训练 Rank，其中 2 个可以采。单进程训练可能只有 1 个业务 PID，多 Rank 训练按实际进程数增加，启动器和数据加载进程另计。',
      hint: '连接后等到想观察的训练阶段，再手动点 start。演练到时自动停止并退出。',
      processes: [
        { label: 'torchrun 启动器', host: '4201', container: '17', command: 'torchrun --nproc-per-node=2 train.py', evidence: '派生训练进程 · 无 NPU 上下文' },
        { label: '训练 Rank 0', host: '4212', container: '28', command: 'python3 train.py', device: 'NPU 0', evidence: '近期计算 0.62 s/step · 耗时稳定',
          reason: 'Rank 0 在 NPU 0 上执行训练，近期单步计算耗时稳定，可作为稳态基线。' },
        { label: '训练 Rank 1', host: '4213', container: '29', command: 'python3 train.py', device: 'NPU 1', evidence: '近期计算 1.08 s/step · 同作业更慢',
          reason: 'Rank 1 在 NPU 1 上执行同一训练作业，近期单步计算耗时比 Rank 0 高约 74%，适合先采这一段排查。' },
      ],
    },
    infer: {
      title: '推理服务进度', initialElapsed: 514, initialWork: 12760, replaySize: 240, requestsPerSecond: 12,
      goals: ['跟踪目标请求', '排查排队热点'],
      guide: '先从请求路由或 worker 日志确认执行进程，再结合 NPU 与处理队列判断。',
      count: '本例 3 个进程，1 个 API 服务进程 + 2 个 NPU worker，其中 2 个可以采。真实数量取决于部署，API 和模型计算可能在同一个进程，也可能由多组 worker 分担。',
      hint: '连接后观察请求流量，选好时机再手动点 start。演练到时自动停止并退出。',
      processes: [
        { label: 'API 服务进程', host: '61300', container: '41', command: 'python3 serve.py --role api', evidence: '接收和路由请求 · 无 NPU 上下文' },
        { label: '推理 worker 0', host: '61312', container: '53', command: 'python3 serve.py --worker-id 0', device: 'NPU 0', evidence: '目标请求 req-481 · 待处理 2 个',
          reason: '路由日志显示样例请求 req-481 交给 worker 0，由 NPU 0 执行。采集时向该 worker 重放同类请求。' },
        { label: '推理 worker 1', host: '61313', container: '54', command: 'python3 serve.py --worker-id 1', device: 'NPU 1', evidence: '待处理 11 个 · 同服务队列更长',
          reason: 'worker 1 负责 NPU 1 的推理，待处理队列在同服务中更长。先采这里以观察拥塞时段。' },
      ],
    },
  };

  const scenario = get('attach-scenario');
  const environment = get('attach-env');
  const goal = get('goal');
  const duration = get('duration');
  const pidField = get('pid');
  const attachOutput = get('attach-output');
  const processList = get('process-list');
  const processGroup = processList.closest('fieldset');
  const attachButton = get('attach-button');
  const startButton = get('start-button');
  const stopButton = get('stop-button');
  const quitButton = get('quit-button');
  let jobStartedAt;
  let capture = null;
  let rounds = 0;

  const activeScenario = () => scenarios[scenario.value];
  const isTraining = () => scenario.value === 'train';
  const currentPid = () => pidField.value.trim();
  const position = (time, start) => Math.max(0, (time - start) / 1000);
  const isBusy = () => capture && capture.status !== 'done';
  const integer = new Intl.NumberFormat('zh-CN');
  const formatNumber = value => integer.format(value);
  const baseOutput = () => attachOutput.value.trim().replace(/\/+$/, '');

  function formatClock(seconds) {
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const parts = [Math.floor(total / 60) % 60, total % 60];
    if (hours) parts.unshift(hours);
    return parts.map(value => String(value).padStart(2, '0')).join(':');
  }

  function jobAt(time) {
    const settings = activeScenario();
    const advance = jobStartedAt === undefined ? 0 : position(time, jobStartedAt);
    if (isTraining()) {
      const limit = settings.epochs * settings.epochSteps;
      const completed = Math.min(Math.floor(advance), limit - settings.initialWork);
      return { work: settings.initialWork + completed, max: limit, elapsed: settings.initialElapsed + completed };
    }
    const requests = Math.floor(advance * settings.requestsPerSecond);
    return { work: settings.initialWork + requests, elapsed: settings.initialElapsed + advance, replayed: requests % settings.replaySize, batch: 1 + Math.floor(requests / settings.replaySize), max: settings.replaySize };
  }

  function renderTask(time) {
    const task = jobAt(time);
    const training = isTraining();
    const settings = activeScenario();
    const progress = training ? task.work : task.replayed;
    const complete = training && task.work === task.max;
    get('task-title').textContent = settings.title;
    get('task-work-label').textContent = training ? '全局 Step' : '累计完成请求';
    get('task-stage-label').textContent = training ? '当前 Epoch' : '流量回放批次';
    get('task-work').textContent = formatNumber(task.work) + (training ? ' / ' + formatNumber(task.max) : '');
    get('task-stage').textContent = training
      ? Math.min(settings.epochs, Math.floor(task.work / settings.epochSteps) + 1) + ' / ' + settings.epochs
      : '第 ' + task.batch + ' 批';
    get('task-time').textContent = formatClock(task.elapsed);
    get('task-note').textContent = training ? (complete ? '训练已结束' : '训练进行中') : '当前批次请求';
    get('task-progress-label').textContent = training
      ? (100 * progress / task.max).toFixed(1) + '%'
      : formatNumber(progress) + ' / ' + formatNumber(task.max);
    const bar = get('task-progress');
    bar.max = task.max;
    bar.value = progress;
    bar.setAttribute('aria-label', training ? '训练 Step 完成进度' : '当前回放批次请求完成进度');
    const band = get('task-capture-band');
    band.hidden = !training || !capture || capture.startedAt === undefined;
    if (!band.hidden) {
      const start = jobAt(capture.startedAt).work;
      const end = jobAt(capture.endedAt ?? time).work;
      band.style.left = start / task.max * 100 + '%';
      band.style.width = (end - start) / task.max * 100 + '%';
      band.dataset.state = capture.status;
    }
  }

  function selectedProcess() {
    return activeScenario().processes.find(process => process[environment.value] === currentPid());
  }

  function renderProcesses() {
    const { processes, count, guide } = activeScenario();
    const namespace = environment.value;
    get('process-count').textContent = count;
    get('process-guide').textContent = guide;
    processList.replaceChildren(...processes.map((process, index) => {
      const row = document.createElement('label');
      row.className = 'advanced-process scene-choice';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'advanced-process';
      radio.value = process[namespace];
      radio.disabled = !process.device;
      const content = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = process.label;
      const proof = document.createElement('small');
      proof.textContent = [process.device, process.evidence].filter(Boolean).join(' · ');
      const command = document.createElement('code');
      command.className = 'advanced-process-command';
      command.textContent = process.command;
      content.append(title, proof, command);
      const pid = document.createElement('span');
      pid.className = 'advanced-process-pid';
      const number = document.createElement('code');
      number.textContent = 'PID ' + radio.value;
      pid.append(number);
      if (namespace === 'container') {
        const host = document.createElement('small');
        host.textContent = '宿主机 ' + process.host;
        pid.append(host);
      }
      if (index === (goal.value === 'baseline' ? 1 : 2)) {
        const match = document.createElement('small');
        match.className = 'advanced-process-match';
        match.textContent = '符合目标';
        pid.append(match);
      }
      row.append(radio, content, pid);
      return row;
    }));
  }

  function renderAttach(time = performance.now()) {
    const container = environment.value === 'container';
    const pid = currentPid();
    const process = selectedProcess();
    const output = attachOutput.value.trim();
    const validPid = /^[1-9][0-9]*$/.test(pid) && Number(pid) <= 2147483647;
    const validOutput = Boolean(output) && !/[\x00-\x1f\x7f"'\\%><|&$;\x60]/.test(output);
    const selectable = validPid && Boolean(process?.device);
    const localNamespace = container ? '容器' : '宿主机';
    const otherNamespace = container ? '宿主机' : '容器';
    const otherProcess = !process && validPid
      ? activeScenario().processes.find(item => item[container ? 'host' : 'container'] === pid)
      : undefined;
    const fieldMessage = get('pid-match');
    fieldMessage.hidden = !pid;
    fieldMessage.dataset.state = selectable ? 'matched' : validPid && !process && !otherProcess ? 'unverified' : 'unavailable';
    fieldMessage.textContent = !validPid ? 'PID 须是正整数。'
      : selectable ? '已匹配 · ' + process.label + ' · ' + process.device
      : process ? '已匹配 · ' + process.label + ' · 这个样例进程不执行 NPU 计算。'
      : otherProcess ? '当前' + localNamespace + '清单未匹配。该 PID 属于样例' + otherNamespace + '，对应' + localNamespace + ' PID ' + otherProcess[environment.value] + '。'
      : '当前' + localNamespace + '样例清单未匹配 PID ' + pid + '。浏览器无法查询现场，请在任务所在环境核对。';
    const canGenerate = validOutput && validPid && !otherProcess && (!process || selectable);
    const locked = Boolean(isBusy());
    for (const radio of processList.querySelectorAll('input')) radio.checked = !radio.disabled && radio.value === pid;
    const suggested = activeScenario().processes[goal.value === 'baseline' ? 1 : 2];
    const selection = get('selection');
    selection.dataset.selected = String(selectable);
    selection.textContent = process?.device
      ? '已选 PID ' + pid + '。' + process.reason
      : '按当前目标优先看 PID ' + suggested[environment.value] + '。' + suggested.reason;
    if (process?.device && process !== suggested) selection.textContent += ' 当前目标的样例优先项是 PID ' + suggested[environment.value] + '。';
    const candidate = validPid ? pid : suggested[environment.value];
    const sockets = 'ls "$HOME"/dynamic_profiling_socket_* 2>/dev/null';
    const inspect = 'ps -p ' + (otherProcess ? otherProcess[environment.value] : candidate) + ' -o pid,ppid,etime,args';
    get('discovery-note').textContent = container
      ? '在宿主机用 npu-smi info 查到用卡进程后，用 NSpid 确认容器内的 PID。然后切到任务所在容器核对候选 socket 和进程命令。'
      : '在任务所在节点运行 npu-smi info，先看 Process id 列，再核对动态采集 socket 和进程命令。请用现场 PID 替换示例值。';
    get('discovery-code').textContent = container
      ? '# 宿主机（替换为现场查到的宿主机 PID）\ngrep NSpid /proc/' + (process?.host ?? otherProcess?.host ?? suggested.host) + '/status\n\n# 任务容器内（用现场容器 PID 替换）\n' + sockets + '\n' + inspect
      : 'npu-smi info\n' + sockets + '\n' + inspect;
    get('execution-note').textContent = container
      ? '在任务所在容器的另一个终端运行。相对路径以运行 msprof 的目录为准。'
      : '在任务所在节点的另一个终端运行。相对路径以运行 msprof 的目录为准。';
    if (canGenerate && !selectable) {
      get('execution-note').textContent += ' 手填 PID 尚未核对，请先在现场确认进程存活、实际占用 NPU 且开启了动态采集。';
    }
    get('session-hint').textContent = activeScenario().hint;
    pidField.setAttribute('aria-invalid', String(Boolean(pid) && (!validPid || Boolean(otherProcess) || Boolean(process && !selectable))));
    attachOutput.setAttribute('aria-invalid', String(!validOutput));
    showError('attach-error', validOutput ? '' : '请输入有效的 Linux 结果目录。');
    showCode('attach-command', canGenerate
      ? 'msprof --dynamic=on --pid=' + pid + ' --output=' + shellQuote(output)
      : '# 选定目标 PID 并填写结果目录后生成命令', canGenerate);
    get('export-command').textContent = 'msprof --export=on --output=' + shellQuote(
      (validOutput ? baseOutput() : './prof_attach') + '/PROF_实际目录名'
    );
    for (const control of [scenario, environment, goal, duration, pidField, attachOutput, processGroup]) control.disabled = locked;
    syncChoices();
    const task = jobAt(time);
    attachButton.disabled = locked || !selectable || !validOutput || (isTraining() && task.work === task.max);
    startButton.disabled = capture?.status !== 'connected' || (isTraining() && task.work === task.max);
    stopButton.disabled = capture?.status !== 'recording';
    quitButton.disabled = capture?.status !== 'connected';
    get('session-state').textContent = {
      connecting: '正在模拟连接 PID ' + pid,
      connected: '已连接 PID ' + pid + ' · 等待手动 start',
      recording: '采集中 · 业务继续运行',
      flushing: '正在收尾 · 写入并汇总分片',
      done: capture && '采集完成 · PID ' + capture.pid + ' · 会话已退出',
    }[capture?.status] ?? (selectable && validOutput ? '就绪 · PID ' + pid : '等待选择可采集的样例进程');
    renderLive(time);
  }

  function addLog(message, time = performance.now()) {
    const log = get('output-log');
    const follow = log.scrollHeight - log.clientHeight - log.scrollTop < 24;
    const entry = document.createElement('li');
    const stamp = document.createElement('time');
    stamp.textContent = formatClock(jobAt(time).elapsed);
    entry.append(stamp, document.createTextNode(message));
    log.append(entry);
    if (follow) log.scrollTop = log.scrollHeight;
  }

  function renderLive(time) {
    renderTask(time);
    const elapsed = capture?.startedAt === undefined ? 0 : position(capture.endedAt ?? time, capture.startedAt);
    const limit = capture?.limit ?? Number(duration.value);
    const bar = get('window-bar');
    bar.max = limit;
    bar.value = Math.min(elapsed, limit);
    bar.dataset.state = capture?.status ?? 'idle';
    get('capture-clock').textContent = formatClock(Math.min(elapsed, limit)) + ' / ' + formatClock(limit);
    const range = get('capture-range');
    range.hidden = capture?.startedAt === undefined;
    if (!range.hidden) {
      const from = jobAt(capture.startedAt).work;
      const to = jobAt(capture.endedAt ?? time).work;
      range.textContent = (isTraining() ? '全局 Step ' : '累计请求 ') + formatNumber(from) + ' → ' + formatNumber(to);
    }
  }

  function renderShards() {
    const summary = get('shard-summary');
    summary.hidden = capture.shards.length === 0;
    const total = capture.shards.reduce((sum, shard) => sum + shard.kib, 0);
    const events = capture.shards.reduce((sum, shard) => sum + shard.events, 0);
    get('shard-totals').textContent = capture.shards.length + ' 片 · ' + formatNumber(events) + ' 条事件 · ' + (total / 1024).toFixed(2) + ' MiB（示意）';
    get('shard-list').replaceChildren(...capture.shards.map((shard, index) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = '分片 ' + String(index + 1).padStart(2, '0');
      const range = document.createElement('span');
      range.textContent = '+' + shard.from.toFixed(1) + ' → +' + shard.to.toFixed(1) + ' s';
      const size = document.createElement('span');
      size.textContent = formatNumber(shard.kib) + ' KiB';
      item.append(name, range, size);
      return item;
    }));
  }

  function writeShard(end, time) {
    const from = capture.writtenUntil;
    if (end <= from) return;
    const seconds = end - from;
    const index = capture.shards.length + 1;
    const events = Math.max(1, Math.round(seconds * (isTraining() ? 1180 : 860) + index * 7));
    const kib = Math.max(1, Math.round(events * (isTraining() ? 0.33 : 0.29)));
    capture.shards.push({ from, to: end, events, kib });
    capture.writtenUntil = end;
    addLog('分片 ' + String(index).padStart(2, '0') + ' 写入 ' + formatNumber(events) + ' 条事件 · ' + formatNumber(kib) + ' KiB', time);
    renderShards();
  }

  function refreshCapture(time) {
    if (capture?.status === 'connecting' && time >= capture.connectsAt) {
      capture.status = 'connected';
      addLog('PID ' + capture.pid + ' 已连接 · 等待输入 start', time);
      renderAttach(time);
    }
    if (capture?.status === 'recording') {
      const elapsed = Math.min(position(time, capture.startedAt), capture.limit);
      while (capture.writtenUntil + 2 <= elapsed) writeShard(capture.writtenUntil + 2, time);
      const task = jobAt(time);
      if (elapsed >= capture.limit || (isTraining() && task.work === task.max)) {
        stopCapture(Math.min(time, capture.startedAt + capture.limit * 1000), time);
      }
    }
    if (capture?.status === 'flushing' && time >= capture.flushAt) {
      writeShard(position(capture.endedAt, capture.startedAt), time);
      capture.status = 'done';
      rounds += 1;
      const result = baseOutput() + '/PROF_DEMO_' + String(rounds).padStart(4, '0');
      get('attach-artifact').textContent = '模拟产物 ' + result;
      get('attach-artifact').hidden = false;
      get('round-count').textContent = '演练已完成 ' + rounds + ' 轮';
      addLog('(msprof) quit · 本轮已落盘，业务独立运行', time);
      renderAttach(time);
    }
  }

  function stopCapture(end, time = end) {
    capture.status = 'flushing';
    capture.endedAt = end;
    capture.flushAt = time + 1100;
    addLog('(msprof) stop · 停止采样，整理缓冲区', time);
    renderAttach(time);
  }

  function clearCapture() {
    capture = null;
    get('shard-summary').hidden = true;
    get('attach-artifact').hidden = true;
    get('output-log').replaceChildren();
    get('round-count').textContent = rounds ? '演练已完成 ' + rounds + ' 轮' : '模拟输出';
  }

  function loadScenario() {
    jobStartedAt = document.body.dataset.page === 'advanced' ? performance.now() : undefined;
    goal.value = 'baseline';
    [...goal.options].forEach((option, index) => { option.textContent = activeScenario().goals[index]; });
    rounds = 0;
    clearCapture();
    addLog('任务已在运行，选择用卡进程后可以开始采集。');
    pidField.value = '';
    renderProcesses();
    renderAttach();
  }

  scenario.addEventListener('change', loadScenario);
  environment.addEventListener('change', () => {
    pidField.value = '';
    renderProcesses();
    renderAttach();
  });
  goal.addEventListener('change', () => {
    renderProcesses();
    renderAttach();
  });
  duration.addEventListener('change', () => renderAttach());
  processList.addEventListener('change', event => {
    pidField.value = event.target.value;
    renderAttach();
  });
  for (const field of [pidField, attachOutput]) field.addEventListener('input', () => renderAttach());
  attachButton.addEventListener('click', () => {
    const time = performance.now();
    clearCapture();
    capture = { status: 'connecting', connectsAt: time + 700, limit: Number(duration.value), pid: currentPid(), writtenUntil: 0, shards: [] };
    addLog('连接动态采集端点 · PID ' + currentPid(), time);
    renderAttach(time);
  });
  startButton.addEventListener('click', () => {
    const time = performance.now();
    capture.status = 'recording';
    capture.startedAt = time;
    get('round-count').textContent = '演练第 ' + (rounds + 1) + ' 轮';
    addLog('(msprof) start · 开始记录 PID ' + capture.pid, time);
    renderAttach(time);
    stopButton.focus();
  });
  stopButton.addEventListener('click', () => stopCapture(performance.now()));
  quitButton.addEventListener('click', () => {
    clearCapture();
    addLog('(msprof) quit · 已断开，任务继续运行');
    renderAttach();
    attachButton.focus();
  });
  window.addEventListener('profiler-page-change', event => {
    if (event.detail === 'advanced' && jobStartedAt === undefined) jobStartedAt = performance.now();
  });
  setInterval(() => {
    if (jobStartedAt === undefined) return;
    const time = performance.now();
    refreshCapture(time);
    if (document.body.dataset.page !== 'advanced') return;
    renderLive(time);
    if (isTraining()) {
      const task = jobAt(time);
      if (task.work === task.max) {
        attachButton.disabled = true;
        startButton.disabled = true;
      }
    }
  }, 250);


  const torchScenario = get('torch-scenario');
  const torchFormat = get('torch-format');
  const torchOutput = get('torch-output');
  const stepFields = ['skip', 'warmup', 'active'].map(name => get('torch-' + name));

  function profilerCode(inference, format, output, skip, warmup, active) {
    const fn = inference ? 'run_profiled_inference' : 'run_profiled_training';
    const step = inference ? 'infer_one_step' : 'train_one_step';
    return [
      'from torch_npu import profiler as npu_profiler',
      '',
      '',
      'def ' + fn + '(steps, ' + step + '):',
      '    config = npu_profiler._ExperimentalConfig(',
      '        profiler_level=npu_profiler.ProfilerLevel.Level0,',
      '        aic_metrics=npu_profiler.AiCMetrics.AiCoreNone,',
      '        export_type=[npu_profiler.ExportType.' + format + '],',
      '    )',
      '    with npu_profiler.profile(',
      '        activities=[',
      '            npu_profiler.ProfilerActivity.CPU,',
      '            npu_profiler.ProfilerActivity.NPU,',
      '        ],',
      '        schedule=npu_profiler.schedule(',
      '            skip_first=' + skip + ', wait=0, warmup=' + warmup + ',',
      '            active=' + active + ', repeat=1,',
      '        ),',
      '        on_trace_ready=npu_profiler.tensorboard_trace_handler(',
      '            ' + JSON.stringify(output) + ',',
      '        ),',
      '        experimental_config=config,',
      '    ) as prof:',
      '        for step in steps:',
      '            ' + step + '(step)',
      '            prof.step()',
      '',
      '# 传入现有循环的迭代器和单步函数：',
      '# ' + fn + '(steps, ' + step + ')',
    ].join('\n');
  }

  function renderTorch() {
    syncChoices();
    const inference = torchScenario.value === 'infer';
    const format = torchFormat.value;
    const output = torchOutput.value.trim();
    const validOutput = Boolean(output) && !/[\x00-\x1f\x7f]/.test(output);
    torchOutput.setAttribute('aria-invalid', String(!validOutput));
    const validSteps = stepFields.map(field => {
      const valid = field.value !== '' && field.validity.valid;
      field.setAttribute('aria-invalid', String(!valid));
      return valid;
    }).every(Boolean);
    const [skip, warmup, active] = stepFields.map(field => Number(field.value));
    const total = skip + warmup + active;
    get('torch-entry').textContent = inference ? '推理 worker 的执行循环' : '训练 Rank 的迭代循环';
    get('torch-entry-note').textContent = inference
      ? '每个 step 对应 worker 执行的一次 batch 或 engine step。服务框架如果已有 profiler 接口，应从框架入口控制采集。'
      : '一步通常包含前向、反向和优化器更新。把 prof.step() 放在完整训练迭代结束的位置。';
    const windowBar = get('step-window');
    windowBar.replaceChildren();
    if (validSteps) {
      const phases = [['跳过', skip, 'skip'], ['预热', warmup, 'warmup'], ['记录', active, 'active']];
      for (const [label, steps, phase] of phases.filter(([, count]) => count > 0)) {
        const block = document.createElement('span');
        block.dataset.phase = phase;
        block.style.flexGrow = steps;
        block.textContent = label + ' ' + steps + ' 步';
        windowBar.append(block);
      }
    }
    get('torch-steps').textContent = validSteps
      ? '记录第 ' + (skip + warmup + 1) + ' 至 ' + total + ' 步（从 1 开始）。一次采集至少需要完成 ' + total + ' 次迭代，后续迭代照常执行。'
      : '填写有效步数后预览采集计划。';
    showError('torch-error', validSteps
      ? (validOutput ? '' : '请输入有效的结果目录。')
      : '跳过步数需在 0–10000，预热在 0–100，记录在 1–1000，均为整数。');
    const valid = validSteps && validOutput;
    showCode('torch-code', valid
      ? profilerCode(inference, format, output, skip, warmup, active)
      : '# 填写有效的步数和结果目录后生成代码', valid);
    get('torch-artifact').textContent = validOutput
      ? output.replace(/\/+$/, '') + '/…_ascend_pt/\n└─ ASCEND_PROFILER_OUTPUT/\n' +
        (format === 'Db' ? '   └─ ascend_pytorch_profiler*.db' : '   ├─ trace_view.json\n   └─ kernel_details.csv')
      : '等待有效的结果目录';
  }

  for (const field of [torchScenario, torchFormat]) field.addEventListener('change', renderTorch);
  for (const field of [...stepFields, torchOutput]) field.addEventListener('input', renderTorch);
  const initialFields = [scenario, environment, duration, attachOutput, torchScenario, torchFormat, torchOutput, ...stepFields]
    .map(field => [field, field.value]);
  window.addEventListener('profiler-reset', () => {
    for (const [field, value] of initialFields) field.value = value;
    for (const details of panel.querySelectorAll('details')) details.open = false;
    selectTab(tabs[0]);
    loadScenario();
    renderTorch();
  });
  loadScenario();
  renderTorch();
})();
