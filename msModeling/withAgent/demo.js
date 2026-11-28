(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);
  const fmt = value => Number(value).toLocaleString('zh-CN', {maximumFractionDigits:2});
  const example = '用当前工作区的 Qwen3-32B 配置，比一比两套 A3 部署方案。以现有业务负载为准，TTFT 上限 1.5 秒、TPOT 上限 50 ms。先仿真，给我最值得上机验证的方案。';
  const model = 'Qwen3-32B';
  const profile = 'ATLAS_800_A3_752T_128G_DIE';
  const workload = {input_tokens:2048, output_tokens:256, concurrency:32};
  const defaultTargets = {ttft:1500, tpot:50};
  const files = {
    model: {name:'model.json', content:{model:'Qwen/Qwen3-32B', precision:'BF16'}},
    workload: {name:'standard-qa.json', content:workload},
    hardware: {name:'a3-profiles.json', content:{profile, num_devices:8, unit:'die', physical_cards:4,
      candidates:[{id:'A', TP:4, DP:2}, {id:'B', TP:8, DP:1}]}}
  };
  const candidates = [
    {id:'A', tp:4, dp:2, qps:4.8, ttft:1320, tpot:45},
    {id:'B', tp:8, dp:1, qps:5.1, ttft:1480, tpot:55}
  ];
  const measurements = {
    A: [{qps:4.3,ttft:1510,tpot:55},{qps:4.7,ttft:1410,tpot:48},{qps:4.6,ttft:1400,tpot:47}],
    B: [{qps:4.8,ttft:1500,tpot:57},{qps:5.0,ttft:1480,tpot:54},{qps:4.9,ttft:1470,tpot:53}]
  };
  const labels = {idle:'等待用户提问',task:'等待确认仿真任务',simulating:'生成仿真候选',simulation:'仿真候选已就绪',
    running:'示例实测进行中',final:'复测结论已生成'};
  const experimentNames = ['同负载基线','参数试验','独立复测'];
  const metricNames = {qps:'请求吞吐',ttft:'平均 TTFT',tpot:'平均 TPOT'};
  const metricUnits = {qps:'req/s',ttft:'ms',tpot:'ms/token'};
  const intro = '我可以根据工作区里的模型、负载和硬件画像帮你比较两套 A3 部署方案。先说说你要判断什么。';

  let host = location.hash === '#client' ? 'client' : 'ide';
  let timer;
  let state;

  function freshState() {
    return {phase:'idle', view:'task', targets:{...defaultTargets}, selected:'A', progress:0, authorization:null,
      messages:[{speaker:'agent', text:intro}]};
  }

  function add(speaker, text, actions = []) {
    state.messages.push({speaker, text, actions});
  }

  function candidate(id = state.selected) {
    return candidates.find(row => row.id === id);
  }

  function meets(values) {
    return values.ttft <= state.targets.ttft && values.tpot <= state.targets.tpot;
  }

  function quality() {
    return candidates.filter(meets).sort((a,b) => b.qps-a.qps)[0] || null;
  }

  function targetText() {
    return 'TTFT ≤ '+fmt(state.targets.ttft)+' ms · TPOT ≤ '+fmt(state.targets.tpot)+' ms/token';
  }

  function configText(row = candidate()) {
    return '方案 '+row.id+' · TP'+row.tp+' × DP'+row.dp;
  }

  function facts(entries) {
    return '<dl class="kv">'+entries.map(([label,value,note]) =>
      '<dt>'+escape(label)+'</dt><dd>'+escape(value)+(note?'<small>'+escape(note)+'</small>':'')+'</dd>'
    ).join('')+'</dl>';
  }

  function button(label, action, primary = false) {
    return '<button type="button" class="'+(primary?'primary':'secondary')+'" data-action="'+escape(action)+'">'+escape(label)+'</button>';
  }

  function heading(title, detail, status, tone = '') {
    return '<div class="view-head"><div><h1>'+escape(title)+'</h1><p>'+escape(detail)+'</p></div>'+
      '<span class="status-pill '+tone+'">'+escape(status)+'</span></div>';
  }

  function taskView() {
    const ready = state.phase !== 'idle';
    return heading('A3 方案评估任务','以一张任务卡贯穿仿真、寻优和独立复测。',ready ? labels[state.phase] : '待发起')+
      '<section class="card"><h2>任务输入</h2>'+
      facts([
        ['模型',model+' · BF16','工作区 model.json'],
        ['负载','2,048 输入 / 256 输出 token · 并发 32','工作区 standard-qa.json'],
        ['设备','Atlas 800 A3 · 4 张卡 / 8 die','工作区 a3-profiles.json · 内置画像注册名'],
        ['比较对象','方案 A · TP4 × DP2 / 方案 B · TP8 × DP1'],
        ['性能目标',targetText(),ready?'用户请求与任务确认':'示例任务的目标']
      ])+'<div class="card-actions">'+(state.phase === 'task' ? button('核对并确认任务','open-task',true) :
        state.phase === 'idle' ? button('使用示例提问','fill-example',true) : button('查看运行记录','evidence'))+'</div></section>'+
      '<section class="card"><h2>执行范围</h2><p>'+(
        state.authorization ? '已确认 '+fmt(state.authorization.trials)+' 次／'+fmt(state.authorization.minutes)+' 分钟的示例上机预算。' :
        '任务从仿真开始。选择上机时，再确认设备范围、次数和时间预算。'
      )+'</p></section>';
  }

  function metricRow(key, values, palette = ['','alt']) {
    const target = key === 'qps' ? null : state.targets[key];
    const max = Math.max(...values.map(item => item.values[key]), target || 0) * 1.14;
    return '<div class="chart-grid">'+values.map((item,index) => {
      const value = item.values[key];
      return '<div class="chart-line"><label><span>'+escape(item.label)+'</span><strong>'+fmt(value)+' '+metricUnits[key]+'</strong></label>'+
        '<div class="track" aria-hidden="true"><span class="'+(target && value > target ? 'warn' : palette[index] || '')+
        '" style="width:'+value/max*100+'%"></span>'+(target?'<i style="left:'+target/max*100+'%"></i>':'')+'</div></div>';
    }).join('')+'</div>';
  }

  function metricCards(values, palette) {
    return '<div class="card-grid">'+['ttft','tpot'].map(key => '<section class="card"><h2>'+metricNames[key]+'</h2>'+
      '<p class="section-note">标线为目标 '+fmt(state.targets[key])+' '+metricUnits[key]+'</p>'+
      metricRow(key,values,palette)+'</section>').join('')+'</div>';
  }

  function simulationView() {
    const best = quality();
    const status = best ? '已有达标候选' : '待调整约束或方案';
    const canSelect = state.phase === 'simulation';
    return heading('候选对比','两套方案共用模型、4 张 A3 卡和标准问答负载。',status,best?'good':'warning')+
      '<section class="card"><h2>仿真候选表</h2><p class="section-note">构造的仿真输出示例 · '+escape(targetText())+'</p>'+
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>方案</th><th>并行配置</th><th>QPS</th><th>TTFT</th><th>TPOT</th><th>目标</th></tr></thead><tbody>'+
      candidates.map(row => '<tr class="'+(row.id === state.selected ? 'selected' : '')+'"><td><label><input type="radio" name="candidate" value="'+row.id+
        '" '+(row.id===state.selected?'checked ':'')+(canSelect?'':'disabled ')+'> '+row.id+'</label></td><td>TP'+row.tp+' × DP'+row.dp+'</td><td>'+
        fmt(row.qps)+'</td><td>'+fmt(row.ttft)+' ms</td><td>'+fmt(row.tpot)+' ms/token</td><td class="'+(meets(row)?'pass':'fail')+'">'+
        (row.id === best?.id ? '推荐' : meets(row) ? '达标' : '超限')+'</td></tr>').join('')+
      '</tbody></table></div><p class="section-note">'+escape(best?'推荐 '+configText(best)+'，它在时延达标的候选中吞吐最高。':
        '当前示例的两套候选均有时延超限。可保留仿真记录，或重置场景后尝试其他目标。')+'</p></section>'+
      metricCards(candidates.map(values => ({label:'方案 '+values.id, values})))+
      '<section class="card"><h2>当前选中 · '+escape(configText())+'</h2><p>'+
      (meets(candidate())?'在仿真示例中达到时延目标，可作为优先验证对象。':'存在时延超限，可查看详情并按预算验证。')+
      '</p><details><summary>查看配置差异</summary><pre>'+
      escape('共同条件: '+model+' | '+profile+' | 8 die\n方案 A: TP 4 / DP 2\n方案 B: TP 8 / DP 1\n输入 2048、输出 256，负载并发 32')+
      '</pre></details><div class="card-actions">'+button('导出仿真方案','export-sim')+
      (canSelect ? button('申请上机验证','open-device',true) : button('查看运行记录','evidence'))+'</div></section>';
  }

  function runSteps() {
    if (!state.authorization) return [
      ['读取并核对工作区配置','保留模型、负载和画像来源。','已完成'],
      ['搜索并行候选','对比两套部署方案。',state.phase === 'simulating'?'进行中':'已完成'],
      ['整理仿真证据','按目标筛选并说明淘汰原因。',state.phase === 'simulating'?'等待':'已完成']
    ];
    return experimentNames.map((name,i) => [
      name,
      ['在相同模型与负载下建立基线。','对选中的方案调整服务并发上限。','以同一请求集独立验证参数。'][i],
      i < state.progress?'已完成':i === state.progress?'进行中':'等待'
    ]);
  }

  function executionView() {
    const auth = state.authorization;
    return heading('运行进度',auth ? '按确认的设备与预算展示每个试验的状态。' : '按同一任务记录展示仿真进度。',labels[state.phase])+
      '<section class="card"><h2>'+(auth ? '示例上机任务' : '示例仿真任务')+'</h2>'+
      (auth ? facts([['验证对象',configText(candidate(auth.candidate))],['设备','4 张 A3 卡 / 8 die'],
        ['预算',state.progress+' / '+auth.trials+' 次 · 时间上限 '+auth.minutes+' 分钟'],['验收条件',targetText()]]) : '')+
      '<ol class="timeline">'+runSteps().map(([name,detail,status]) => '<li class="'+(status==='已完成'?'complete':status==='进行中'?'active':'')+
        '"><i class="timeline-dot" aria-hidden="true"></i><div><strong>'+escape(name)+'</strong><small>'+escape(detail)+'</small></div><span>'+
        escape(status)+'</span></li>').join('')+'</ol></section>'+
      '<section class="card"><h2>证据位置</h2><p>仿真候选、上机确认和复测记录都属于 RUN-A3-DEMO。</p><div class="card-actions">'+
      button('打开运行记录','evidence')+(state.phase==='final'?button('查看复测结论','final',true):'')+'</div></section>';
  }

  function finalView() {
    const auth = state.authorization;
    const row = candidate(auth.candidate);
    const [base,trial,repeat] = measurements[row.id];
    const pass = meets(repeat);
    return heading('同负载复测结论','构造的实测记录示例 · 同型号、精度、设备与请求集。',pass?'示例实测达标':'示例实测未达标',pass?'good':'warning')+
      '<section class="card"><h2>'+escape(configText(row))+' · 服务并发上限 48</h2>'+
      '<p>'+escape(pass?'独立复测的两项时延均在目标内。':'独立复测仍有时延超限，下一步应回看候选与约束。')+'</p>'+
      '<div class="range-grid">'+Object.keys(metricNames).map(key => '<div class="range-tile"><span>'+metricNames[key]+'</span><strong>'+
        fmt(repeat[key])+' '+metricUnits[key]+'</strong></div>').join('')+'</div></section>'+
      metricCards([{label:'基线',values:base},{label:'独立复测',values:repeat}],['alt','good'])+
      '<section class="card"><h2>三条运行证据</h2><div class="table-wrap"><table class="data-table"><thead><tr>'+
      '<th>记录</th><th>QPS</th><th>TTFT</th><th>TPOT</th></tr></thead><tbody>'+
      [base,trial,repeat].map((values,i) => '<tr><td>R'+(i+1)+' · '+experimentNames[i]+'</td><td>'+fmt(values.qps)+'</td><td>'+
        fmt(values.ttft)+' ms</td><td>'+fmt(values.tpot)+' ms/token</td></tr>').join('')+
      '</tbody></table></div><div class="card-actions">'+button('回看仿真候选','simulation')+button('导出决策包','export-final',true)+
      '</div></section>';
  }

  function evidenceView() {
    const command = 'python -m cli.inference.throughput_optimizer Qwen/Qwen3-32B --device '+profile+
      ' --num-devices 8 --input-length 2048 --output-length 256 --tp-sizes 4 8 --ttft-limit '+state.targets.ttft+' --tpot-limit '+state.targets.tpot;
    return heading('运行记录','集中查看任务条件、确认记录与可复现的输入。','RUN-A3-DEMO')+
      '<section class="card"><h2>任务和数据来源</h2>'+facts([
        ['硬件与负载','工作区配置示例'],['仿真与实测','场景构造数据'],['用户确认',state.authorization?'仿真、上机范围与预算':'当前仅涉及仿真']
      ])+'<details><summary>查看仿真命令示例</summary><pre>'+escape(command)+'</pre></details></section>'+
      '<section class="card"><h2>可带走的文件</h2><p>导出包包含任务输入、所选方案及当前可用证据。</p><div class="card-actions">'+
      (state.phase==='final'?button('导出决策包','export-final',true):
        ['simulation','running'].includes(state.phase)?button('导出仿真方案','export-sim',true):button('回任务卡','task'))+
      '</div></section>';
  }

  const views = {task:taskView,simulation:simulationView,execution:executionView,final:finalView,evidence:evidenceView};

  function available(view) {
    if (view === 'simulation') return ['simulation','running','final'].includes(state.phase);
    if (view === 'execution') return ['simulating','simulation','running','final'].includes(state.phase);
    if (view === 'final') return state.phase === 'final';
    return !!views[view];
  }

  const desktop = $('msiDesktop');
  const ide = desktop.querySelector('.ide');
  const agentFrame = $('agentClient');
  const viewNames = {task:'任务卡', simulation:'候选对比', execution:'运行进度', final:'复测结论', evidence:'运行记录'};
  let ideFile = 'workload';
  let welcomeDots;
  let themeIndex = 0;
  const themes = [
    {id:'calc',mode:'light',brand:'calc'},
    {id:'infinite',mode:'light',brand:''},
    {id:'chase',mode:'dark',brand:''}
  ];

  function mountView(kind) {
    const container = kind === 'client' ? $('agentPreviewContent') : $('editorContent');
    const old = container.querySelector('.msm-view-content');
    const position = old?.dataset.view === state.view ? old.scrollTop : 0;
    const names = Object.entries(viewNames).map(([id,label]) => '<button type="button" data-open-view="'+id+'" '+
      (id===state.view?'aria-current="page" ':'')+(available(id)?'':'disabled ')+ '>'+label+'</button>').join('');
    const content = views[state.view]().replaceAll('name="candidate"','name="'+kind+'-candidate" data-candidate');
    container.innerHTML = '<div class="msm-webview"><nav class="msm-view-tabs" aria-label="msModeling 视图">'+names+
      '</nav><div class="msm-view-content" data-view="'+state.view+'" tabindex="0" aria-label="当前 Webview">'+
      '<div class="webview-note">msModeling 演示 · 示例数据 · RUN-A3-DEMO</div>'+content+'</div></div>';
    container.querySelector('.msm-view-content').scrollTop = position;
  }

  function renderEditor() {
    if (!ideFile) {
      $('editorTabs').innerHTML = '<button class="editor-tab active" role="tab" aria-selected="true"><span class="codicon codicon-graph"></span>'+
        '<span>msModeling · '+viewNames[state.view]+'</span></button>';
      $('breadcrumbs').textContent = 'serving-eval › Webview';
      mountView('ide');
      return;
    }
    const file = files[ideFile], lines = JSON.stringify(file.content,null,2).split('\n');
    $('editorTabs').innerHTML = '<button class="editor-tab active" role="tab" aria-selected="true"><span class="codicon codicon-json"></span>'+
      '<span>'+file.name+'</span></button><button type="button" class="editor-tab" data-action="task"><span class="codicon codicon-graph"></span>msModeling</button>';
    $('breadcrumbs').textContent = 'serving-eval › configs › '+file.name;
    const code = lines.map(line => {
      const parts = escape(line).split(/(&quot;[^&]*&quot;)/g);
      return '<span class="code-line">'+parts.map((part,i)=> i%2 ? '<span style="color:#ce9178">'+part+'</span>' : part).join('')+'</span>';
    });
    $('editorContent').innerHTML = '<div class="code-view"><div class="line-numbers">'+lines.map((_,i)=>'<div class="line-number">'+(i+1)+'</div>').join('')+
      '</div><div class="code-surface"><pre class="code-highlight" aria-label="'+file.name+'">'+code.join('')+'</pre></div><div class="minimap" aria-hidden="true"></div></div>';
  }

  function renderView() {
    $('agentPreviewTabs').innerHTML = '<div class="agent-preview-tab is-selected"><button role="tab" aria-selected="true" title="msModeling Webview">msModeling · '+
      viewNames[state.view]+'</button><button type="button" aria-label="关闭 msModeling Webview" data-action="close-preview"><span class="codicon codicon-close"></span></button></div>';
    mountView('client');
    renderEditor();
    $('terminalOutput').innerHTML = '<div class="terminal-line">msModeling · RUN-A3-DEMO · '+labels[state.phase]+'</div>'+
      '<div class="terminal-line">示例数据 · 本地交互演示</div>';
  }

  function vCard(label, action) {
    return '<button class="wzh-chat-viz-card" type="button" data-action="'+escape(action)+'"><span class="wzh-chat-viz-card-icon"><span class="codicon codicon-graph"></span></span>'+
      '<span class="wzh-chat-viz-card-copy"><strong>'+escape(label)+'</strong><small>msModeling Webview</small></span><span class="codicon codicon-chevron-right"></span></button>';
  }

  function agentWelcome() {
    return '<div class="wzh-chat-welcome"><div class="wzh-chat-welcome-hero"><canvas class="wzh-chat-welcome-dots" aria-hidden="true"></canvas>'+
      '<img class="wzh-chat-welcome-logo" src="assets/insight-chat/msinsightbotAvatar.png" alt=""><div class="wzh-chat-welcome-text">你好，我是 MindStudio Agent</div></div>'+
      '<div class="wzh-chat-guide-list">'+vCard('比较两套 A3 部署方案','fill-example')+vCard('查看 msModeling 任务卡','task')+'</div></div>';
  }

  function ideWelcome() {
    return '<div class="welcome"><div class="welcome-mark"><span class="codicon codicon-copilot"></span></div><h2>使用 Agent 构建</h2>'+
      '<p>用工作区里的模型、负载和设备数据完成性能评估。</p><div class="chat-suggestions">'+
      '<button class="suggestion" data-action="fill-example"><span class="codicon codicon-checklist"></span><span>比较两套 A3 部署方案</span><span class="codicon codicon-arrow-right"></span></button>'+
      '<button class="suggestion" data-action="task"><span class="codicon codicon-graph"></span><span>查看 msModeling 任务卡</span><span class="codicon codicon-arrow-right"></span></button></div></div>';
  }

  function renderChat() {
    const activeActions = {
      idle:['fill-example'],task:['open-task'],simulating:['execution'],
      simulation:['simulation','open-device'],running:['execution'],final:['final','evidence']
    }[state.phase];
    const messages = state.messages.filter((_,i)=>i>0);
    welcomeDots?.destroy();
    welcomeDots = null;
    if (!messages.length) {
      $('chatMessages').innerHTML = ideWelcome();
      $('agentMessages').innerHTML = agentWelcome();
      const canvas = $('agentMessages').querySelector('canvas');
      if (canvas) welcomeDots = window.MS_INSIGHT_CHAT_DOTS?.create(canvas);
      return;
    }
    const content = text => escape(text).replaceAll('\n','<br>');
    $('chatMessages').innerHTML = messages.map(message => {
      const user = message.speaker === 'user';
      const buttons = (message.actions||[]).filter(([,action])=>activeActions.includes(action));
      return '<article class="interactive-item-container msm-ide-message '+(user?'interactive-request':'interactive-response')+'">'+
        '<div class="value">'+(user?'<div class="request-attachments"><button data-file="workload"><span class="codicon codicon-folder"></span>serving-eval</button></div>':'')+
        content(message.text)+'</div>'+buttons.map(([label,action])=>'<button type="button" class="msm-transcript-action" data-action="'+action+'">'+escape(label)+'</button>').join('')+'</article>';
    }).join('');
    $('agentMessages').innerHTML = messages.map(message => {
      const user = message.speaker === 'user';
      if (user) return '<article class="wzh-chat-qcard has-context msm-agent-message">'+
        '<button class="wzh-chat-qcard-toggle" type="button" data-action="toggle-question" aria-label="展开或收起问题" aria-expanded="true"><span class="codicon codicon-chevron-down"></span></button>'+
        '<div class="wzh-chat-anchor-chip wzh-chat-qcard-anchor"><div class="wzh-chat-code-chip"><img src="assets/insight-shell/localfile.svg" class="wzh-chat-code-icon" alt=""><span class="wzh-chat-code-path">serving-eval</span></div></div><div class="wzh-chat-qcard-text">'+content(message.text)+'</div></article>';
      const buttons = (message.actions||[]).filter(([,action])=>activeActions.includes(action));
      return '<article class="wzh-chat-message ai msm-agent-message"><div class="wzh-chat-body-content"><div class="wzh-chat-answer">'+
        content(message.text)+buttons.map(([label,action])=>vCard(label,action)).join('')+'</div></div></article>';
    }).join('');
    for (const log of [$('chatMessages'),$('agentMessages')]) log.scrollTop = log.scrollHeight;
  }

  function setView(view) {
    if (!available(view)) return;
    state.view = view;
    ideFile = null;
    if (host === 'client') showPreview(true);
    renderView();
  }

  function render() {
    renderView();
    renderChat();
  }

  function updateActive(next) {
    host = next;
    desktop.dataset.activeWindow = next === 'client' ? 'agent' : 'main';
    agentFrame.classList.toggle('is-active',next === 'client');
  }

  const floating = window.MS_FLOATING_WINDOW({
    desktop, frame:agentFrame, header:$('agentTitlebar'),
    initialRect:()=>{
      const available=desktop.clientWidth||innerWidth,w=Math.min(1800,available-48);
      return {x:Math.max(8,(available-w)/2),y:ide.offsetTop,w,h:ide.offsetHeight};
    },
    onActivate:()=>updateActive('client'),
    onVisibility:(visible,maximized)=>{
      $('taskbarAgent').classList.toggle('is-active',visible);
      $('agentMaximize').setAttribute('aria-pressed',String(maximized));
      if(!visible)updateActive('ide');
    }
  });

  function setHost(next) {
    if (next === 'client') floating.open();
    else document.dispatchEvent(new CustomEvent('msi:window-open'));
  }

  function showPreview(show) {
    agentFrame.classList.toggle('has-preview',show);
    document.getElementById('agentPreviewResize').hidden = !show;
    $('agentPreview').hidden = !show;
    $('agentPreviewToggle').setAttribute('aria-expanded',String(show));
  }

  function parseTargets(text) {
    const result = {...defaultTargets};
    for (const key of ['ttft','tpot']) {
      const match = text.match(new RegExp(key+'[^0-9]{0,14}(\\d+(?:\\.\\d+)?)\\s*(毫秒|ms|秒|s)?','i'));
      if (!match) continue;
      const value = +match[1] * (['秒','s'].includes(match[2]?.toLowerCase()) ? 1000 : 1);
      if (value > 0 && value <= (key === 'ttft' ? 60000 : 10000)) result[key] = Math.round(value);
    }
    return result;
  }

  function send(text) {
    add('user',text);
    switch (state.phase) {
      case 'idle':
        state.targets = parseTargets(text);
        state.phase = 'task';
        state.view = 'task';
        add('agent','这个演示使用工作区内的 Qwen3-32B、标准问答负载和两套 A3 并行方案。已把识别到的目标预填到任务卡，确认后先做仿真。',
          [['核对并确认任务','open-task']]);
        break;
      case 'task':
        add('agent','可以在任务确认框里调整 TTFT 和 TPOT。确认后再生成候选。',[['核对任务','open-task']]);
        break;
      case 'simulation':
        if (/上机|复测|实测|寻优/.test(text) && !/不上机|只仿真|仅仿真/.test(text)) {
          add('agent','上机需要确认当前方案、设备和执行预算。请核对范围。',[['打开上机确认','open-device']]);
        } else {
          add('agent','两套候选和各自的时延判断都在 Webview。可导出方案后结束这一轮。',[['打开候选对比','simulation']]);
        }
        break;
      case 'final':
        add('agent','决策包里有基线、试验和独立复测记录，可以随当前配置一起导出。',[['打开复测结论','final']]);
        break;
      default:
        add('agent','当前示例在运行中，可查看已经完成的阶段。',[['查看运行进度','execution']]);
    }
    render();
  }

  function openTask() {
    if (state.phase !== 'task') return;
    $('task-dialog-context').innerHTML = facts([['模型与精度',model+' · BF16'],['负载','2,048 / 256 token · 并发 32'],
      ['设备','Atlas 800 A3 · 4 卡 / 8 die'],['候选','TP4 × DP2 / TP8 × DP1']]);
    $('task-ttft').value = state.targets.ttft;
    $('task-tpot').value = state.targets.tpot;
    $('task-dialog').showModal();
  }

  function runSimulation() {
    state.phase = 'simulating';
    state.view = 'execution';
    add('user','确认任务：'+targetText()+'。本轮先仿真。');
    add('agent','已锁定任务输入，正在比较两套并行配置。');
    render();
    timer = setTimeout(() => {
      state.phase = 'simulation';
      state.view = 'simulation';
      const best = quality();
      if (best) state.selected = best.id;
      add('agent',best ? '当前目标下建议优先验证方案 '+best.id+'。展开 Webview，能看到每项约束和淘汰原因。' :
        '两套例子都未满足当前时延目标。候选表保留各项超限指标。',[['打开候选对比','simulation'],['申请上机','open-device']]);
      render();
    },850);
  }

  function openDevice() {
    if (state.phase !== 'simulation') return;
    $('device-dialog-context').innerHTML = facts([
      ['对象',configText()],['设备范围','Atlas 800 A3 · 4 张卡 / 8 die'],
      ['复用负载','2,048 / 256 token · 并发 32'],['允许调整','服务并发上限；保留模型与设备范围']
    ]);
    $('device-dialog').showModal();
  }

  function advanceExecution() {
    if (state.phase !== 'running') return;
    state.progress++;
    if (state.progress < experimentNames.length) {
      render();
      timer = setTimeout(advanceExecution,720);
      return;
    }
    state.phase = 'final';
    state.view = 'final';
    const sample = measurements[state.authorization.candidate][2];
    add('agent',meets(sample) ? '独立复测示例达到当前时延目标。可以查看基线和复测对比，或导出已确认的方案。' :
      '独立复测示例仍有时延超限。建议保留证据并回看候选。',[['查看复测结论','final'],['查看运行记录','evidence']]);
    render();
  }

  function exportResult(final) {
    const row = candidate(final ? state.authorization.candidate : state.selected);
    const data = {run_id:'RUN-A3-DEMO', mode:final?'simulated_retest':'simulation_only', evidence_type:'constructed_demo',
      task:{model,profile,num_devices:8,device_unit:'die',workload,targets:state.targets},
      selected:{id:row.id, tp:row.tp, dp:row.dp}, simulation:candidates.map(item => ({...item, meets_latency_targets:meets(item)}))};
    if (final) {
      data.authorization = state.authorization;
      data.service_parameters = {max_concurrency:48};
      data.runs = measurements[row.id].map((values,i) => ({id:'R'+(i+1), stage:experimentNames[i], values}));
      data.conclusion = meets(measurements[row.id][2]) ? 'passed_demo' : 'needs_review_demo';
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json;charset=utf-8'}));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = final ? 'msmodeling-决策包.json' : 'msmodeling-仿真方案.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    $('terminalOutput').insertAdjacentHTML('beforeend','<div class="terminal-line">'+(final?'已导出示例决策包':'已导出仿真方案')+'</div>');
  }

  function reset() {
    clearTimeout(timer);
    ideFile = 'workload';
    state = freshState();
    for (const id of ['chatInput','agentChatInput']) $(id).value = '';
    $('device-trials').value = '3';
    $('device-minutes').value = '30';
    updateInputButtons();
    render();
  }

  function currentInput() {
    return $(host === 'client' ? 'agentChatInput' : 'chatInput');
  }

  function updateInputButtons() {
    $('chatSend').disabled = !$('chatInput').value.trim();
    $('agentSend').disabled = !$('agentChatInput').value.trim();
    $('agentChatClean').hidden = $('agentChatCleanDivider').hidden = !$('agentChatInput').value;
  }

  function fillExample() {
    const input = currentInput();
    input.value = example;
    updateInputButtons();
    input.focus();
  }

  function changeTheme() {
    themeIndex = (themeIndex + 1) % themes.length;
    const theme = themes[themeIndex];
    agentFrame.dataset.themeId = theme.id;
    agentFrame.dataset.theme = theme.mode;
    if (theme.brand) agentFrame.dataset.brand = theme.brand;
    else delete agentFrame.dataset.brand;
  }

  function openFile(key) {
    const file = files[key];
    if (!file) return;
    if (host === 'ide') {
      ideFile = key;
      renderEditor();
    } else {
      $('file-title').textContent = file.name;
      $('file-content').textContent = JSON.stringify(file.content,null,2);
      $('file-dialog').showModal();
    }
  }

  function renderWorkspaces() {
    $('fileTree').innerHTML = '<div class="tree-row monaco-tl-row folder"><span class="codicon codicon-chevron-down"></span><span class="file-name">configs</span></div>'+
      Object.entries(files).map(([key,file])=>'<button type="button" class="tree-row monaco-tl-row" role="treeitem" aria-level="2" data-file="'+key+
        '" style="padding-left:22px"><span class="codicon codicon-json"></span><span class="file-name">'+file.name+'</span></button>').join('')+
      '<button type="button" class="tree-row monaco-tl-row" data-action="task"><span class="codicon codicon-graph"></span><span class="file-name">msModeling Webview</span></button>';
    $('contextChip').innerHTML = '<span class="codicon codicon-folder"></span> serving-eval';
    $('agentContext').innerHTML = '<span class="wzh-chat-code-pill">📁 serving-eval</span>';
    $('agentTopicList').innerHTML = '<button type="button" class="selected" data-action="task">Qwen3-32B · A3 方案对比</button>'+
      '<button type="button" data-action="evidence">本次运行记录</button>';
  }

  const actions = {
    'fill-example':fillExample,'open-task':openTask,'open-device':openDevice,
    'export-sim':() => exportResult(false),'export-final':() => exportResult(true),
    'close-preview':()=>showPreview(false)
  };
  document.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control) return;
    if (control.dataset.closeDialog) $(control.dataset.closeDialog).close();
    if (control.dataset.openView) setView(control.dataset.openView);
    if (control.dataset.action) {
      const action = control.dataset.action;
      if (action === 'toggle-question') {
        const collapsed = control.closest('.wzh-chat-qcard').classList.toggle('is-collapsed');
        control.setAttribute('aria-expanded',String(!collapsed));
      } else if (actions[action]) actions[action]();
      else setView(action);
    }
    if (control.dataset.file) openFile(control.dataset.file);
  });
  document.addEventListener('change', event => {
    if (!event.target.hasAttribute('data-candidate') || state.phase !== 'simulation') return;
    state.selected = event.target.value;
    renderView();
    const panel = host === 'client' ? $('agentPreviewContent') : $('editorContent');
    panel.querySelector('input:checked')?.focus({preventScroll:true});
  });

  for (const [formId,inputId] of [['chatForm','chatInput'],['agentChatForm','agentChatInput']]) {
    const form = $(formId), input = $(inputId);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) { input.focus(); return; }
      input.value = '';
      updateInputButtons();
      ideFile = null;
      send(question);
    });
    input.addEventListener('input',updateInputButtons);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
  }

  $('task-form').addEventListener('submit',event => {
    event.preventDefault();
    if (state.phase !== 'task') return;
    state.targets = {ttft:+$('task-ttft').value, tpot:+$('task-tpot').value};
    $('task-dialog').close();
    runSimulation();
  });

  $('device-form').addEventListener('submit',event => {
    event.preventDefault();
    if (state.phase !== 'simulation') return;
    state.authorization = {candidate:state.selected,trials:+$('device-trials').value,minutes:+$('device-minutes').value};
    state.progress = 0;
    state.phase = 'running';
    state.view = 'execution';
    $('device-dialog').close();
    add('user','同意上机验证方案 '+state.selected+'。最多 '+state.authorization.trials+' 次，预算 '+state.authorization.minutes+' 分钟。');
    add('agent','会依次展示基线、参数试验和独立复测。Webview 会同步更新每项证据。',[['查看运行进度','execution']]);
    render();
    timer = setTimeout(advanceExecution,720);
  });

  $('desktopAgent').addEventListener('click',()=>setHost('client'));
  $('taskbarAgent').addEventListener('click',()=>host==='client'&&floating.visible?floating.hide():setHost('client'));
  document.addEventListener('msi:window-activated',()=>updateActive('ide'));
  ide.addEventListener('pointerdown',()=>{if(host!=='ide')updateActive('ide')},{capture:true});
  for (const id of ['agentMinimize','agentClose']) $(id).addEventListener('click',()=>floating.hide());
  $('agentMaximize').addEventListener('click',()=>floating.maximize());
  $('agentThemeToggle').addEventListener('click',changeTheme);
  $('agentPreviewToggle').addEventListener('click',()=>showPreview($('agentPreview').hidden));
  $('agentPreviewClose').addEventListener('click',()=>showPreview(false));
  $('agentSidebarToggle').addEventListener('click',event=>{
    const collapsed=agentFrame.classList.toggle('is-sidebar-collapsed');
    event.currentTarget.setAttribute('aria-expanded',String(!collapsed));
  });
  for (const id of ['newChat','agentConversationNew','agentNewTopic']) $(id).addEventListener('click',reset);
  $('terminalForm').addEventListener('submit',event=>event.preventDefault());
  for (const id of ['agentTopicMenu','agentMcpStatus','agentSettings','chatHistory']) $(id).addEventListener('click',()=>setView('evidence'));
  $('agentSearchToggle').addEventListener('click',()=>{
    $('agentTopicSearch').hidden=!$('agentTopicSearch').hidden;
    if (!$('agentTopicSearch').hidden) $('agentTopicSearch').focus();
  });
  $('agentTopicSearch').addEventListener('input',event=>{
    for (const item of $('agentTopicList').children) item.hidden=!item.textContent.toLowerCase().includes(event.target.value.toLowerCase());
  });
  $('agentGuiMode').addEventListener('click',()=>setView(state.view));
  $('agentTuiMode').addEventListener('click',()=>setView('evidence'));
  $('panelToggle').addEventListener('click',()=>$('terminal').hidden=!$('terminal').hidden);
  $('terminalClose').addEventListener('click',()=>$('terminal').hidden=true);
  $('sidebarToggle').addEventListener('click',()=>$('explorer').hidden=!$('explorer').hidden);
  $('chatToggle').addEventListener('click',()=>$('chatPanel').hidden=!$('chatPanel').hidden);
  $('attachContext').addEventListener('click',()=>openFile('workload'));
  $('agentChatClean').addEventListener('click',()=>{
    $('agentChatInput').value = '';
    updateInputButtons();
    $('agentChatInput').focus();
  });

  $('agentPreviewResize').addEventListener('pointerdown', event => {
    if(event.button !== 0 || innerWidth <= 740) return;
    const handle=event.currentTarget;
    const start=event.clientX;
    const chatWidth=agentFrame.querySelector('.agent-conversation').getBoundingClientRect().width;
    const previewWidth=$('agentPreview').getBoundingClientRect().width;
    const total=chatWidth+previewWidth;
    const move=current=>{
      const next=Math.max(260,Math.min(total-380,previewWidth+start-current.clientX));
      agentFrame.style.setProperty('--agent-preview-track',(next/(total-next))+'fr');
    };
    const end=()=>{
      handle.removeEventListener('pointermove',move);
      handle.removeEventListener('lostpointercapture',end);
    };
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener('pointermove',move);
    handle.addEventListener('lostpointercapture',end);
  });

  state = freshState();
  renderWorkspaces();
  render();
  const initialHost=host;
  floating.open();
  showPreview(true);
  if(initialHost==='ide')setHost('ide');
})();
