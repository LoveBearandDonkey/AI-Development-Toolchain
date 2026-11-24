(function () {
  'use strict';
  window.LaunchScriptWorkbench = { mount(host) {
    const $ = id => document.getElementById(id);
    let info = null, result = null, fileRead = 0, intendedPath = '', sampleIndex = 0, stepStart = 10, stepEnd = 15;
    const source = document.createElement('section');
    source.className = 'launch-source'; source.hidden=true; source.setAttribute('aria-label', '导入训练启动脚本');
    source.innerHTML = `<div class="launch-source-head"><strong id="launch-source-title">从已有启动脚本开始</strong><button type="button" class="launch-link" id="launch-exit" hidden>移除脚本</button></div>
      <input type="file" id="launch-file" accept=".sh,.bash,text/plain" hidden>
      <div id="launch-source-error" class="launch-error" role="alert" hidden></div>
      <div id="launch-source-result" class="launch-source-body" hidden><div class="launch-facts" id="launch-facts"></div>
        <div class="launch-code-docs" aria-hidden="true">
          <div class="launch-code-sheet launch-code-sheet-back"><div class="launch-code-paper"><div class="launch-paper-heading"><span class="launch-paper-file-icon"></span><span>sh</span><i></i></div><div class="launch-paper-code" id="launch-mini-source"></div><div class="launch-paper-footer"><span></span><span></span></div></div></div>
          <div class="launch-code-sheet launch-code-sheet-front"><div class="launch-code-paper"><div class="launch-paper-heading"><span class="launch-paper-file-icon"></span><span>python</span><i></i></div><div class="launch-paper-code" id="launch-mini-profile"></div><div class="launch-paper-footer"><span></span><span></span></div></div></div>
        </div>
      </div>`;
    $('controls-header').after(source);
    function renderMiniCode(id,lines){
      $(id).replaceChildren(...lines.slice(0,8).map((text,index)=>{const row=document.createElement('div'),number=document.createElement('span'),code=document.createElement('code');row.className='launch-paper-code-line';if(text.trim().startsWith('#'))row.classList.add('launch-paper-comment');number.textContent=index+1;code.textContent=text.trimEnd();row.append(number,code);return row}));
    }
    const importButton=document.createElement('button');importButton.type='button';importButton.id='launch-choose';importButton.className='button launch-primary';importButton.textContent='导入.sh';$('controls-header').append(importButton);
    const config = document.createElement('section'); config.className = 'launch-window'; config.hidden = true;
    config.innerHTML = `<h2>只采需要的训练区间</h2><p>按 Step 选择稳定阶段，训练保持原规模。</p>
      <label for="launch-ranks">本次采集的全局 Rank<input id="launch-ranks" type="text" value="0" placeholder="例如 0,1" spellcheck="false"></label><p id="launch-rank-note"></p>
      <div id="launch-config-error" class="launch-error" role="alert" hidden></div>`;
    $('scene-phase-field').before(config);
    const outputField = $('output').closest('.field'), outputAnchor = document.createComment('shared output field'); outputField.before(outputAnchor);
    const manualInterval = $('window-slider').closest('.section');
    const windowCard=$('window-slider').closest('.window-card'),windowAnchor=document.createComment('shared collection window');windowCard.before(windowAnchor);
    const windowAxis=[...windowCard.querySelectorAll('.window-axis span')],originalAxis=windowAxis.map(el=>el.textContent);
    const cliOnly = [$('application').closest('.section'),manualInterval,$('scene-phase-field'),$('scene-environment'),$('scene-workload').closest('.scene-field'),$('scene-metric-field'),document.querySelector('[data-scene-goal="operator"]'),$('scene-mstx').closest('label'),$('host-detail'),$('mstx-detail'),$('core-detail'),$('postprocess-section'),$('workflow-mode-section'),...['ascendcl','runtime','mstx','core','aicpu'].map(id=>$(id).closest('.control-row')),...document.querySelectorAll('#config-details>.advanced,#config-details>.collection-groups,#config-view-manual>details.docs')].filter(Boolean);
    cliOnly.forEach(el=>el.classList.add('launch-cli-only'));
    const modeText = [];
    function rememberText(node, imported) { if(node) modeText.push({node, original:node.textContent, imported}); }
    rememberText($('window-start-label').firstChild,'开始 Step');rememberText($('window-end-label').firstChild,'结束 Step（不含）');
    windowCard.querySelectorAll('.window-reading-input').forEach(el=>rememberText(el.lastChild,'Step'));
    for (const [id,title,description] of [['host','CPU 活动','记录框架 CPU 活动与 NPU 的时间关系。'],['memory','框架内存','记录框架张量内存与生命周期。']]) {
      const row=$(id).closest('.control-row');rememberText(row.querySelector('.control-name').firstChild,title+' ');rememberText(row.querySelector('.control-desc'),description);rememberText(row.querySelector('.cost'),'框架');
    }
    rememberText($('scene-host').closest('label').lastChild,'CPU 活动');rememberText($('scene-memory').closest('label').lastChild,'框架内存');
    rememberText(document.querySelector('[data-ai-scenario="framework"] strong'),'配置稳定阶段采集');
    rememberText(document.querySelector('[data-ai-scenario="evidence"] strong'),'查看通信与 CPU 活动');
    rememberText(document.querySelector('.download-options .subtle'),'按本次选中的采集 Rank 与 Step 区间估算；只改变计划下载内容，不修改脚本。未扣压缩、文件老化或共享数据。');
    const additional = document.createElement('div'); additional.className='launch-framework-fields';
    additional.innerHTML = `<div class="control-row"><div class="control-copy"><div class="control-name">调用栈</div><div class="control-desc">记录算子对应的代码调用线索。</div></div><button type="button" id="launch-stack" class="toggle" role="switch" aria-checked="false" aria-label="调用栈"></button></div><div class="control-row"><div class="control-copy"><div class="control-name">输入 Shape</div><div class="control-desc">记录输入张量形状。</div></div><button type="button" id="launch-shapes" class="toggle" role="switch" aria-checked="false" aria-label="输入 Shape"></button></div>`;
    $('memory').closest('.data-box').append(additional);
    for (const [id,label,key] of [['stack','调用栈','profileStack'],['shapes','输入 Shape','recordShapes']]) {
      const choice=document.createElement('label');choice.className='launch-framework-fields';choice.innerHTML='<input id="scene-launch-'+id+'" type="checkbox">'+label;document.querySelector('.scene-supplements').append(choice);
      $('scene-launch-'+id).addEventListener('change',e=>{host.setState({[key]:e.target.checked});host.refresh()});
      $('launch-'+id).addEventListener('click',()=>{host.setState({[key]:!host.getState()[key]});host.refresh()});
    }
    const basis = document.createElement('details'); basis.id='launch-estimate-basis'; basis.hidden=true;
    basis.innerHTML=`<summary>概念预估 · 查看估算依据</summary><p>Step 和 Rank 来自当前脚本配置；每步耗时默认按 2 秒示意，可按业务情况调整。</p><label for="launch-step-seconds">预计每步耗时（秒）<input id="launch-step-seconds" type="number" min="0.01" max="86400" step="0.1" value="2"></label><p id="launch-estimate-context"></p><p>采集项使用演示成本系数，未校准。msModeling 负载画像可用于细化估算，当前未连接仿真服务。</p>`;
    document.querySelector('.volume-breakdown').before(basis);
    $('launch-step-seconds').addEventListener('input',()=>host.refresh());
    const filePath = document.createElement('code'); filePath.id = 'launch-file-path'; filePath.hidden = true;
    filePath.innerHTML='<span class="launch-path-directory"></span><strong class="launch-path-name"></strong>';
    document.querySelector('.capture-file-toolbar').prepend(filePath);
    const changes = document.createElement('span');changes.id='launch-insertion-count';changes.hidden=true;changes.setAttribute('aria-live','polite');document.querySelector('.round-copy-actions').prepend(changes);
    $('copy').classList.add('launch-icon-button');$('copy').setAttribute('aria-label','复制');$('copy').title='复制完整脚本';
    const download = document.createElement('button'); download.type = 'button'; download.id = 'launch-download'; download.className = 'copy-btn launch-icon-button'; download.setAttribute('aria-label','下载');download.title='下载采集脚本';download.innerHTML='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4"/></svg>';download.hidden = true;
    $('copy').after(download);
    const diffView = document.createElement('div'); diffView.id = 'launch-diff'; diffView.className = 'launch-diff'; diffView.hidden = true; diffView.setAttribute('role', 'region'); diffView.setAttribute('aria-label', '启动脚本修改对比'); diffView.tabIndex = 0;
    $('command-surface').after(diffView);
    function renderPath() {
      if(!info||!filePath.clientWidth)return;
      const directory=filePath.querySelector('.launch-path-directory'),name=filePath.querySelector('.launch-path-name');
      const file=intendedPath.split('\\').pop(),folder=intendedPath.slice(0,-file.length);
      const context=document.createElement('canvas').getContext('2d'),style=getComputedStyle(filePath);context.font='400 '+style.fontSize+' '+style.fontFamily;
      const measure=text=>context.measureText(text).width;
      const fullFolder=folder||'',shortFolder=folder?folder.slice(0,3)+'…\\':'';
      const available=filePath.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2;
      directory.textContent=measure(fullFolder+file)<available?fullFolder:shortFolder;
      const nameWidth=available-measure(directory.textContent);context.font='600 '+style.fontSize+' '+style.fontFamily;
      let rendered=file;
      for(let retained=file.length;context.measureText(rendered).width>nameWidth&&retained>10;retained--){const tail=Math.max(10,Math.ceil(retained/2));rendered=file.slice(0,Math.max(0,retained-tail))+'…'+file.slice(-tail)}
      name.textContent=rendered;filePath.title=intendedPath;filePath.setAttribute('aria-label',intendedPath);
    }
    new ResizeObserver(renderPath).observe(filePath);
    function placeSharedControls() {
      if(!info)return;
      if(host.getView()==='manual')manualInterval.before(config);else $('scene-phase-field').before(config);
      config.append(outputField);
      config.querySelector('label[for="launch-ranks"]').before(windowCard);
    }
    function renderDiff(rows, error) {
      diffView.replaceChildren();
      if (error) { const message = document.createElement('p'); message.className = 'launch-error'; message.textContent = error; diffView.append(message); return; }
      const visible = new Set();
      rows.forEach((row, index) => { if (row.type !== 'context') for (let i = Math.max(0, index - 3); i <= Math.min(rows.length - 1, index + 3); i++) visible.add(i); });
      let skipped = 0;
      function addSkipped() { if (!skipped) return; const spacer = document.createElement('div'); spacer.className = 'launch-diff-skipped'; spacer.textContent = '⋯ ' + skipped + ' 行未改动'; diffView.append(spacer); skipped = 0; }
      rows.forEach((row, index) => {
        if (!visible.has(index)) { skipped++; return; }
        addSkipped();
        const line = document.createElement('div'); line.className = 'launch-diff-line launch-diff-' + row.type;
        for (const value of [row.oldLine ?? '', row.newLine ?? '', row.type === 'add' ? '+' : row.type === 'remove' ? '−' : '']) { const cell = document.createElement('span'); cell.className = 'launch-diff-gutter'; cell.textContent = value; cell.setAttribute('aria-hidden', 'true'); line.append(cell); }
        const code = document.createElement('code'); code.textContent = row.text || ' '; line.append(code); diffView.append(line);
      });
      addSkipped();
    }
    function options() {
      const shared=host.getState();
      return { start: stepStart, end: stepEnd,
        ranks: $('launch-ranks').value, output: $('output').value, level: 'level'+shared.level.slice(-1),
        cpu: shared.host, memory: shared.memory, stack: shared.profileStack, shapes: shared.recordShapes };
    }
    function currentWindow(){return {start:stepStart,end:stepEnd,max:Math.min(info?.trainIters||10000000,Math.max(40,Math.ceil(stepEnd/40)*40))}}
    function setWindowBoundary(boundary,value){const limit=info.trainIters||10000000;value=Math.round(value);if(!Number.isFinite(value))return;if(boundary==='start')stepStart=Math.max(0,Math.min(stepEnd-1,value));else stepEnd=Math.max(stepStart+1,Math.min(limit,value));host.refresh()}
    function estimation() {
      if(!info)return null;
      const values=options(),seconds=Number($('launch-step-seconds').value);
      let ranks=[];
      try{ranks=window.LaunchScriptImport.build(info,values).ranks}catch{}
      const steps=values.end-values.start;
      return {steps,seconds,duration:steps*seconds,ranks:ranks.length,
        valid:ranks.length>0&&Number.isFinite(seconds)&&seconds>=.01&&seconds<=86400};
    }
    function render() {
      if (!info) return null;
      document.body.classList.add('launch-import-mode'); config.hidden = false; filePath.hidden = false; changes.hidden=false; download.hidden = false; diffView.hidden = false; basis.hidden=false; $('command-surface').hidden = true;
      placeSharedControls();
      $('scene-form').hidden = false; $('scene-inactive').hidden = true;
      for(const entry of modeText)entry.node.textContent=entry.imported;
      const shared=host.getState();if(shared.memory&&!shared.host)host.setState({host:true});
      $('scene-host').checked=shared.host;$('scene-memory').checked=shared.memory;
      const scenePlan=host.getScenePlan();if(shared.level!==scenePlan.level||shared.host!==scenePlan.host||shared.memory!==scenePlan.memory)$('scene-budget-value').textContent='自定义 · '+shared.level.toUpperCase();
      $('host').setAttribute('aria-label','CPU 活动');$('memory').setAttribute('aria-label','框架内存');$('host').setAttribute('aria-checked',String(shared.host));
      $('task').disabled=true;
      for(const [id,key]of [['stack','profileStack'],['shapes','recordShapes']]){$('launch-'+id).setAttribute('aria-checked',String(Boolean(shared[key])));$('scene-launch-'+id).checked=Boolean(shared[key])}
      $('code-settings').hidden = true; $('collection-rounds').hidden = true; $('copy-all').hidden = true;
      document.querySelector('.capture-method-tabs').hidden = true;
      document.querySelector('.terminal-title').textContent = '环境准备与采集方案';
      $('code-language').textContent = 'Bash'; $('code-reference').href = 'https://gitee.com/ascend/MindSpeed/blob/master/docs/zh/user-guide/profile.md';
      $('command').readOnly = true; $('command').setAttribute('aria-label', '修改后的完整启动脚本');
      $('command-feedback').hidden = true; $('restore-command').hidden = true; $('validation').hidden = true;
      const values = options(); let error = '';
      try { result = window.LaunchScriptImport.build(info, values); } catch (e) { error = e.message; result = null; }
      renderMiniCode('launch-mini-source',info.command.split('\n').filter(line=>line.trim()));
      renderMiniCode('launch-mini-profile',result?['import torch_npu','with torch_npu.profiler.profile(','    schedule=torch_npu.profiler.schedule(','        skip_first='+values.start+',','        active='+(values.end-values.start)+')) as prof:','    for step in range('+values.end+'):','        train_one_step()','        prof.step()']:['import torch_npu','# 等待有效配置']);
      $('launch-config-error').hidden = !error; $('launch-config-error').textContent = error;
      const range=currentWindow();
      for(const [boundary,value,min,max]of [['start',stepStart,0,stepEnd-1],['end',stepEnd,stepStart+1,info.trainIters||10000000]]){
        const field=$('window-'+boundary+'-number'),thumb=$('window-'+boundary);field.value=value;field.min=min;field.max=max;field.setAttribute('aria-label',boundary==='start'?'开始 Step':'结束 Step（不含）');
        thumb.setAttribute('aria-valuemin',min);thumb.setAttribute('aria-valuemax',boundary==='end'?range.max:max);thumb.setAttribute('aria-valuenow',value);thumb.setAttribute('aria-valuetext','第 '+value+' Step '+(boundary==='start'?'开始':'结束')+'采集');thumb.setAttribute('aria-label',boundary==='start'?'采集开始 Step':'采集结束 Step');thumb.style.left=value/range.max*100+'%';
      }
      $('window-slider').setAttribute('aria-label','采集 Step 范围，拖动两个滑块选择开始与结束 Step');
      $('window-selection').style.left=stepStart/range.max*100+'%';$('window-selection').style.width=(stepEnd-stepStart)/range.max*100+'%';
      $('window-duration').textContent='采集 '+(stepEnd-stepStart)+' Step';
      $('window-summary').textContent='跳过前 '+stepStart+' Step，采集区间 ['+stepStart+', '+stepEnd+')，共 '+(stepEnd-stepStart)+' Step。';
      windowAxis.forEach((el,index)=>el.textContent=Math.round(range.max*index/4)+' Step');
      $('launch-rank-note').textContent = info.total ? '训练共 ' + info.total + ' Rank；这里只选择记录哪些 Rank，不改变训练规模。' : '训练总规模待确认；这里只选择采集 Rank，不改变分布式启动参数。';
      $('launch-download').disabled = !result; $('copy').disabled = !result;
      changes.textContent='插入 '+(result?.insertions.length||0)+' 处';
      renderPath();
      renderDiff(result?.diff || [], error);
      const text = result ? result.script : '# ' + error;
      $('command').value = text; $('manual-copy').value = text;
      const preview = document.querySelector('.preview'); preview.dataset.commandPending = 'false';
      const context=estimation();
      $('launch-step-seconds').setAttribute('aria-invalid',String(!Number.isFinite(context.seconds)||context.seconds<.01||context.seconds>86400));
      $('launch-estimate-context').textContent=context.valid?context.steps+' Step × '+context.seconds+' 秒/Step ≈ '+Number(context.duration.toFixed(2))+' 秒；按 '+context.ranks+' 个采集 Rank 估算。':'请修正采集区间、Rank 或每步耗时后查看数据量。';
      $('artifact-path').textContent = values.output; $('artifact-tree').textContent = '所选 Rank 的 Profiler 数据\n  原始记录与解析产物（以实际版本输出为准）';
      $('artifact-path-note').textContent = '目录在训练执行端；当前未运行、未读取产物。'; $('artifact-delivery-note').textContent = '脚本参数识别与修改演示；未验证现场 MindSpeed / CANN 版本。';
      return { command: error ? '' : text, copyLabel: '复制', name:info.name };
    }
    function load(text, name, sample) {
      try {
        const next = window.LaunchScriptImport.inspect(text, name);
        info = next; source.hidden=false; diffView.scrollTop = 0; $('launch-source-error').hidden = true;
        const scriptName=name;
        const sampleFolder=sample?(sample.id==='deepseek'?'01_mindspeed_deepseek_v4_flash':'04_mindspeed_glm5_744b'):null;
        intendedPath=sample?'D:\\Projects\\compute-graph-viewer-wzh\\Profiling_Insight_and_Tool\\training-run-twin-standalone\\config-test\\new test\\'+sampleFolder+'\\'+scriptName:scriptName;
        $('launch-source-title').textContent = info.model;
        $('launch-exit').hidden = false; $('launch-source-result').hidden = false;
        $('launch-facts').replaceChildren();
        for (const [label, value] of [['训练规模', info.total ? info.nodes + ' 节点 × ' + info.perNode + ' NPU' : '待确认'], ['并行配置', ['TP', 'PP', 'EP', 'CP'].map(k => k + ' ' + (info[k.toLowerCase()] ?? '?')).join(' / ')]]) {
          const box = document.createElement('div'), caption = document.createElement('span'), reading = document.createElement('b'); caption.textContent = label; reading.textContent = value; reading.title=value; box.append(caption, reading); $('launch-facts').append(box);
        }
        stepStart=10;stepEnd=15; $('launch-ranks').value = '0'; $('launch-step-seconds').value='2'; $('output').value = './profiling/' + (sample?.id || 'training');
        host.prepare();
        host.activate(); host.refresh();
      } catch (e) { source.hidden=false; $('launch-source-error').hidden = false; $('launch-source-error').textContent = e.message + (info ? ' 已选任务保持不变。' : ''); }
    }
    function clear(refresh = true) {
      fileRead++; sampleIndex=0; info = null; result = null; source.hidden=true; document.body.classList.remove('launch-import-mode'); config.hidden = true; filePath.hidden = true; changes.hidden=true; download.hidden = true; diffView.hidden = true; basis.hidden=true; $('command-surface').hidden = false;
      outputAnchor.after(outputField);windowAnchor.after(windowCard);windowAxis.forEach((el,index)=>el.textContent=originalAxis[index]);
      for(const boundary of ['start','end']){$('window-'+boundary+'-number').setAttribute('aria-label',boundary==='start'?'开始时间，秒':'结束时间，秒');$('window-'+boundary).setAttribute('aria-label',boundary==='start'?'采集开始时间':'采集结束时间')}
      $('window-slider').setAttribute('aria-label','采集时间范围，拖动两个滑块选择开始与结束时间');
      modeText.forEach(entry=>entry.node.textContent=entry.original);$('host').setAttribute('aria-label','Host CPU 与内存');$('memory').setAttribute('aria-label','算子内存');$('task').disabled=false;
      $('launch-exit').hidden = true; $('launch-source-result').hidden = true; $('launch-source-error').hidden = true;
      $('launch-source-title').textContent = '从已有启动脚本开始';
      $('scene-view-location').hidden = false;
      host.resetAi();
      if (refresh) host.refresh();
    }
    $('launch-choose').addEventListener('click', () => {fileRead++;const id=['deepseek','glm5'][sampleIndex++%2],sample=window.LaunchScriptSamples.find(item=>item.id===id);load(sample.source,sample.name,sample)});
    $('launch-file').addEventListener('change', async event => {
      const file = event.target.files[0], ticket = ++fileRead; event.target.value = ''; if (!file) return;
      try {
        if (file.size > 1024 * 1024 || !/\.(sh|bash)$/i.test(file.name)) throw Error('请选择小于 1 MB 的 .sh / .bash 启动脚本。');
        const text = await file.text(); if (ticket === fileRead) load(text, file.name);
      } catch (e) { if (ticket === fileRead) { source.hidden=false; $('launch-source-error').hidden = false; $('launch-source-error').textContent = e.message; } }
    });
    $('launch-exit').addEventListener('click', () => clear());
    for (const input of config.querySelectorAll('input,select')) input.addEventListener(input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input', () => {
      host.refresh();
    });
    $('launch-download').addEventListener('click', () => {
      if (!result) return;
      const url = URL.createObjectURL(new Blob([result.script], { type: 'text/x-shellscript;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = info.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      host.notify('已生成采集脚本；请在原训练环境启动');
    });
    function aiExample(key) {
      if(!info)return null;
      const choices={framework:{level:'l1',host:true,title:'配置稳定阶段采集'},lightweight:{level:'l0',host:false,title:'减少采集扰动和数据量'},evidence:{level:'l1',host:true,title:'查看通信与 CPU 活动'}};
      const choice=choices[key];
      return {question:'已导入 '+info.name+'（'+info.model+'）。请帮我'+choice.title+'，保留当前 Step 区间、采集 Rank 和输出目录，并直接展示脚本改动。',
        summary:'基于当前 '+info.model+' 脚本，使用 '+choice.level.toUpperCase()+' 时间线'+(choice.host?'和 CPU 活动':'')+'；关闭内存、调用栈和输入 Shape。保留当前采集区间、Rank 与输出目录，改动和右侧预估已同步。',
        limit:'规则示意配置；预估沿用右侧演示依据，尚未执行训练或接入 msModeling 仿真。',state:{level:choice.level,host:choice.host,memory:false,profileStack:false,recordShapes:false,preset:'custom'}};
    }
    return { render, clear, aiExample, setWindowBoundary, get window(){return info?currentWindow():null}, onViewChange(){if(info)host.refresh()}, get estimation(){return estimation()}, get active() { return Boolean(info); }, get script() { return result?.script || ''; }, get copyLabel() { return '复制'; } };
  } };
})();
