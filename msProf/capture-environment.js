(function(root){
  'use strict';
  const links={
    cann:'https://www.hiascend.com/zh/cann/download',
    msprof:'https://www.hiascend.com/zh/developer/software/mindstudio/download',
    pytorch:'https://gitcode.com/Ascend/pytorch',
    mindspore:'https://www.mindspore.cn/install/',
    mindspeed:'https://gitcode.com/Ascend/MindSpeed/blob/master/docs/zh/user-guide/profile.md',
    pairing:'https://gitcode.com/Ascend/release-management/blob/master/MindStudio/master/release_notes.md'
  };
  function requirements(context){
    const rows=[
      {id:'device',name:'NPU 与驱动',check:'设备可见，当前训练用户可访问',found:'NPU 可见 · 驱动已加载'},
      {id:'cann',name:'CANN 与环境变量',check:'运行库、算子包及当前会话环境',found:'已加载当前 CANN 环境',path:'/usr/local/Ascend/cann',missing:'未找到可用的 CANN 环境。先加载已有安装；尚未安装时再下载。',fix:'source /usr/local/Ascend/cann/set_env.sh',href:links.cann,action:'选择 CANN 安装包'}
    ];
    if(['launch','dynamic','native'].includes(context.method)||context.api==='native'||context.processing)rows.push({id:'msprof',name:'msprof 工具',check:'命令可用，并支持本次采集或解析参数',found:'已找到 msprof · 所需参数可用',missing:'当前环境未找到 msprof。它通常随 CANN 提供，优先加载已有 CANN；确实缺少时再安装配套工具。',fix:'source /usr/local/Ascend/cann/set_env.sh',href:links.msprof,action:'获取配套 msprof'});
    const python=context.imported||context.method==='framework'||context.method==='mstx'&&context.api!=='native';
    if(python){
      const mindspore=context.framework==='mindspore'&&!context.imported;
      rows.push({id:'python',name:'训练使用的 Python',check:'在启动训练的同一 Python 环境中校验',found:'已选中训练 Python 环境',path:'/opt/venv/bin/python3'});
      rows.push(mindspore?{id:'framework',name:'MindSpore Profiler',check:'mindspore.profiler.profile、schedule 等所需接口',found:'所需 Profiler 接口可用',missing:'当前训练环境缺少 MindSpore，或导入失败。安装时按芯片、Python 与 CANN 选择配套版本。',incompatible:'MindSpore 可导入，但当前模板所需接口不完整；需要选择支持该接口的配套版本。',href:links.mindspore,action:'选择配套 MindSpore'}:{id:'framework',name:'PyTorch 与 torch_npu',check:'包可导入，NPU 可用，Profiler 接口齐全',found:'torch / torch_npu 可导入 · Profiler 接口可用',missing:'当前训练 Python 中缺少 torch_npu。按现有 PyTorch、Python 和 CANN 版本选择配套包，无需另装到固定目录。',incompatible:'torch_npu 可导入，但当前模板所需的 Profiler 接口不完整；需要核对版本配套后升级。',href:links.pytorch,action:'选择配套 torch_npu'});
    }
    if(context.method==='native'||context.method==='mstx'&&context.api==='native')rows.push({id:'sdk',name:context.method==='mstx'?'MSTX 头文件与链接库':'AscendCL 开发头文件与库',check:context.method==='mstx'?'mstx/ms_tools_ext.h、libms_tools_ext 可供原工程编译链接':'acl/acl_prof.h 与原工程 AscendCL 链接配置',found:'已找到头文件与库 · 编译路径已配置',path:'/usr/local/Ascend/cann',missing:'运行环境已就绪，但原工程尚未配置对应开发头文件与库。优先复用已安装 Toolkit 中的文件，再补充编译链接路径。',href:links.cann,action:'获取 CANN Toolkit'});
    if(context.method==='mstx'&&context.api!=='native')rows.push({id:'mstx',name:'Python 业务打点接口',check:'torch_npu.npu.mstx.range_start / range_end',found:'所需 MSTX 接口可用',missing:'当前 torch_npu 中未找到所需业务打点接口。',incompatible:'已安装的 torch_npu 不支持当前打点模板，需更换配套版本。',href:links.pytorch,action:'核对 torch_npu 配套版本'});
    if(context.method==='dynamic')rows.push({id:'dynamic',name:'目标进程接入条件',check:'同一容器内，目标任务启动前已设置 PROFILING_MODE=dynamic',found:'示例进程启动条件满足',missing:'示例目标进程启动时未设置 PROFILING_MODE=dynamic；对已经运行的进程补设变量不会生效，需按 run.sh 重新启动任务。',fix:'export PROFILING_MODE=dynamic'});
    if(context.imported)rows.push({id:'mindspeed',name:'MindSpeed 采集参数',check:'当前代码分支支持脚本中的 --profile-* 参数',found:'示例分支支持本次采集参数',missing:'当前 MindSpeed 分支未确认支持这些采集参数。请在原项目目录核对 profile 文档和启动参数，不另建一套训练环境。',incompatible:'示例分支不支持当前 --profile-* 参数组合，需核对支持该功能的分支。',href:links.mindspeed,action:'查看 MindSpeed 配置要求'});
    rows.push({id:'output',name:'产物目录与权限',check:'检查执行端目录、写权限和可用空间',found:'示例目录可写 · 剩余空间 120 GB',path:context.output||'./profiling'});
    return context.processing?rows.filter(row=>row.id!=='device'):rows;
  }
  function report(context,scenario){
    const rows=requirements(context);
    const target=context.imported?'mindspeed':context.method==='dynamic'?(scenario==='incompatible'?'msprof':'dynamic'):context.method==='native'||context.method==='mstx'&&context.api==='native'?'sdk':context.method==='mstx'?'mstx':context.method==='framework'?'framework':'msprof';
    return rows.map(row=>({...row,status:scenario==='ready'||row.id!==target?'pass':scenario==='incompatible'?'incompatible':'missing'}));
  }
  function mount(host){
    const panel=document.createElement('section');panel.id='capture-environment';panel.className='capture-environment';panel.hidden=true;panel.tabIndex=0;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-label','环境准备');
    document.getElementById('command-surface').before(panel);
    const records=new Map();let context=null,key='',resetScroll=true;
    function record(){if(!records.has(key))records.set(key,{scenario:'missing',checked:false,busy:false,timer:0});return records.get(key)}
    const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
    function render(nextContext,visible){
      context=nextContext;key=[context.method,context.framework,context.api,Boolean(context.imported),Boolean(context.processing)].join(':');panel.hidden=!visible;
      if(!visible)return;
      const state=record(),rows=state.checked?report(context,state.scenario):requirements(context),issues=rows.filter(row=>row.status&&row.status!=='pass');
      panel.replaceChildren();panel.setAttribute('aria-busy',String(state.busy));
      const bar=element('div','environment-check-bar'),button=element('button','button environment-check',state.busy?'正在校验…':state.checked?'重新校验':'校验环境');button.type='button';button.disabled=state.busy;
      button.title='演示校验，未连接真实训练主机';
      const summary=element('span','environment-summary',state.busy?'检查工具、接口与执行路径…':state.checked?issues.length?`${rows.length-issues.length} 项通过 · ${issues.length} 项待处理`:`${rows.length} 项通过 · 可继续配置采集`:`待检查 ${rows.length} 项`);summary.setAttribute('role','status');
      if(state.checked&&!state.busy){
        summary.replaceChildren(element('span','environment-count-pass',String(rows.length-issues.length)),document.createTextNode(' 项通过 · '));
        if(issues.length)summary.append(element('span','environment-count-attention',String(issues.length)),document.createTextNode(' 项待处理'));
        else summary.append(document.createTextNode('可继续配置采集'));
      }
      button.addEventListener('click',()=>{state.busy=true;state.checked=false;render(context,true);const checkKey=key;clearTimeout(state.timer);state.timer=setTimeout(()=>{state.busy=false;state.checked=true;if(key===checkKey&&!panel.hidden)render(context,true)},650)});bar.append(button,summary);panel.append(bar);
      const list=element('div','environment-results');
      rows.forEach(row=>{
        const item=element('div','environment-row'),info=element('div','environment-row-info'),name=element('div','environment-row-name',row.name),status=element('span','environment-status',state.busy?'检查中':!state.checked?'待校验':row.status==='pass'?'通过':row.status==='incompatible'?'需核对版本':'待准备');
        status.dataset.status=state.checked?row.status:'pending';info.append(name,element('p','',state.checked&&row.status==='pass'?row.found:row.check));item.append(info,status);
        item.dataset.status=status.dataset.status;
        if(state.checked&&row.status==='pass'){
          status.textContent='';status.setAttribute('role','img');status.setAttribute('aria-label','校验通过');status.title='校验通过';
          status.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m6.5 11.8 4 4 7-7-1.4-1.4-5.6 5.6-2.6-2.6z" fill="var(--surface-1)"/></svg>';
        }
        if(state.checked&&row.status!=='pass'){
          const fix=element('div','environment-remedy');fix.append(element('p','',row.status==='incompatible'?(row.incompatible||'当前工具不支持所需能力，请按 CANN 配套关系核对版本与功能。'):(row.missing||'请在实际训练环境中核对该项。')));
          if(row.fix&&row.status!=='incompatible'){
            const command=element('div','environment-fix-command');command.append(element('code','',row.fix));const copy=element('button','button','复制命令');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(row.fix);copy.textContent='已复制'}catch{copy.textContent='请选中命令复制'}});command.append(copy);fix.append(command);
          }
          if(row.href){const link=element('a','',row.action);link.href=row.href;link.target='_blank';link.rel='noopener';fix.append(link)}
          if(row.status==='incompatible'&&['cann','msprof','sdk'].includes(row.id)){const link=element('a','','查看版本配套');link.href=links.pairing;link.target='_blank';link.rel='noopener';fix.append(link)}
          item.append(fix);
        }
        list.append(item);
      });panel.append(list);
      if(resetScroll){panel.scrollTo({top:0,left:0,behavior:'instant'});resetScroll=false}
    }
    function reset(){
      for(const state of records.values())clearTimeout(state.timer);
      records.clear();context=null;key='';resetScroll=true;panel.replaceChildren();panel.hidden=true;panel.setAttribute('aria-busy','false');panel.scrollTop=0;
    }
    return {render,reset};
  }
  root.CaptureEnvironment={requirements,report,mount};
  if(typeof module==='object'&&module.exports)module.exports={requirements,report};
})(typeof window==='object'?window:globalThis);
