/* Constructed teaching models. No backend simulation, measurement or profile mutation. */
(function(root){
'use strict';
const GiB=2**30;
const capacityPresets={qa:{name:'标准问答',input:2048,output:256,concurrency:32,ttft:2000,tpot:50},long:{name:'长上下文',input:32768,output:256,concurrency:32,ttft:10000,tpot:50},throughput:{name:'高并发短答',input:2048,output:128,concurrency:128,ttft:5000,tpot:80},generation:{name:'长文生成',input:4096,output:1024,concurrency:16,ttft:2000,tpot:50}};
function capacityModel(profile,count,load){
 const positive=v=>Number.isFinite(v)&&v>0;
 if(!Number.isInteger(count)||count<1||!profile.grid||count>totalGrid(profile.grid)||![profile.memory_size_bytes,profile.memory_bandwidth_bytes_ps,profile.mma_ops?.bfloat16,profile.compute_efficiency,profile.memory_efficiency].every(positive))return {error:'请在左侧补全有效的设备数量、BF16 算力、内存、带宽和效率。'};
 const tp=[8,4,2,1].find(n=>count%n===0),dp=count/tp;
 const weights=64, reserve=profile.memory_size_bytes/GiB*.15;
 const room=profile.memory_size_bytes/GiB-reserve-weights/tp;
 const kv=(load.input+load.output)*.00025/tp;
 const memoryCap=Math.max(0,Math.floor(room/kv)*dp);
 const compute=profile.mma_ops.bfloat16*profile.compute_efficiency*tp;
 const bw=profile.memory_bandwidth_bytes_ps*profile.memory_efficiency*tp;
 function at(c){const batch=Math.ceil(c/dp),mem=weights/tp+reserve+kv*batch;
  const ttft=2*32e9*load.input*batch/compute*1000+20;
  const tpot=(weights*GiB+kv*tp*batch*GiB)/bw*1000+2*32e9*batch/compute*1000+3;
  return {mem,ttft,tpot,e2e:(ttft+load.output*tpot)/1000};}
 let lo=0,hi=1000000;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2),r=at(mid);if(r.ttft<=load.ttft&&r.tpot<=load.tpot)lo=mid;else hi=mid-1;}
 const latencyCap=lo,cap=Math.min(memoryCap,latencyCap),current=at(load.concurrency);
 return {tp,dp,reserve,weights,kv,memoryCap,latencyCap,cap,current,at,searchLimit:1000000,first:memoryCap<=latencyCap?'内存':'时延',pass:load.concurrency<=cap,unitMemory:profile.memory_size_bytes/GiB};
}
function totalGrid(grid){return grid.reduce((a,b)=>a*b,1)}
// Keep workload on the first capacity boundary without relaxing either latency target.
// Requests are batched per replica, so concurrency snaps to the last complete batch.
function balanceFullLoad(profile,count,requested,pinned='input'){
 const load={...requested};
 const probe=input=>capacityModel(profile,count,{...load,input});
 let minimum=probe(512);
 if(minimum.error)return {error:minimum.error};
 if(minimum.cap<1){
  for(const output of [1024,512,256,128].filter(v=>v<load.output)){
   load.output=output;minimum=probe(512);if(minimum.cap>0)break;
  }
 }
 if(minimum.cap<1)return {error:'当前硬件与时延目标下，即使最短请求也无法承载，满载联动暂不可用。'};
 if(pinned==='concurrency'){
  if(minimum.cap<load.concurrency){
   for(const output of [1024,512,256,128].filter(v=>v<load.output)){
    load.output=output;minimum=probe(512);if(minimum.cap>=load.concurrency)break;
   }
  }
  const desired=Math.max(1,Math.min(Math.round(load.concurrency),minimum.cap));
  let lo=1,hi=128;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(probe(mid*512).cap>=desired)lo=mid;else hi=mid-1;}
  load.input=lo*512;
 }else{
  load.input=Math.max(512,Math.min(65536,Math.round(load.input/512)*512));
  if(probe(load.input).cap<1){
   let lo=1,hi=load.input/512;
   while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(probe(mid*512).cap>0)lo=mid;else hi=mid-1;}
   load.input=lo*512;
  }
 }
 load.concurrency=probe(load.input).cap;
 return {load,result:capacityModel(profile,count,load)};
}
const api={capacityModel,balanceFullLoad,capacityPresets};
if(typeof module==='object'&&module.exports)module.exports=api;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),f=(n,d=0)=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d});
const hardware=!!document.querySelector('main.workbench');
let mode=hardware&&location.hash!=='#capacity'?'legacy':'explore';
let actionController=null;
const bar=document.createElement('nav');bar.className='mx-switch';bar.setAttribute('aria-label',hardware?'硬件工作视图':'评估工作视图');
bar.innerHTML=hardware
 ?'<button data-mx-mode="legacy" aria-pressed="true">硬件画像</button><button data-mx-mode="explore" aria-pressed="false">承载边界测试</button>'
 :'<button data-mx-mode="explore" aria-pressed="true">优化行动验证</button><button data-mx-mode="legacy" aria-pressed="false">候选方案与验证</button>';
const viewTabs=document.createElement('div');viewTabs.className='page-tabs mx-view-tabs';
while(bar.firstChild)viewTabs.append(bar.firstChild);
bar.append(viewTabs);
const surface=document.createElement('section');surface.className='mx-panel'+(hardware?'':' mx-upgrade');surface.id='mx-content';
const panel=document.createElement('div');panel.className='mx-explore-body';panel.id='mx-explorer';
let legacy;
if(hardware){const stage=document.querySelector('.stage'),wrap=document.createElement('div');wrap.className='mx-layout';wrap.id='mx-hardware-layout';while(stage.firstChild)wrap.append(stage.firstChild);stage.append(surface);legacy=[wrap];}
else{document.querySelector('header').after(surface);legacy=[...document.querySelectorAll('.steps,main.page')];}
if(hardware){
 const heading=legacy[0].querySelector('.stage-top');
 heading.querySelector('.stage-title').append(bar);
 surface.append(heading,panel,...legacy);
}else surface.append(bar,panel,...legacy);
function sync(){const evidence=document.body.dataset.evidenceOpen==='true';surface.hidden=evidence;panel.hidden=evidence||mode!=='explore';legacy.forEach(el=>el.hidden=evidence||mode==='explore');if(hardware)document.querySelector('.stage').classList.toggle('mx-exploring',mode==='explore');bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mxMode===mode)));if(actionController&&mode==='explore'&&!evidence)actionController.refresh();}
bar.addEventListener('click',e=>{const b=e.target.closest('[data-mx-mode]');if(!b)return;mode=b.dataset.mxMode;sync();window.dispatchEvent(new Event('resize'));});
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-evidence-open']});
document.querySelector('#user-evidence')?.addEventListener('click',e=>{const b=e.target.closest('[data-evidence-target]');if(b){mode=b.dataset.mxEvidence||'legacy';sync();const target=$(b.dataset.evidenceTarget);target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});window.dispatchEvent(new Event('resize'));}});
function meter(value,max){
 const pct=value/max*100,over=pct>100,scale=over?Math.max(200,pct*1.08):100;
 const limit=100/scale*100,fill=pct/scale*100;
 return `<div class="mx-meter-wrap"><div class="mx-meter-notes">${over?`<span class="mx-limit-label" style="left:clamp(34px,${limit}%,calc(100% - 34px))">满载 100%</span><b>超出 ${f(pct-100,1)}%</b>`:`<span>使用 ${f(pct,1)}%</span>`}</div><div class="mx-meter" role="img" aria-label="使用 ${f(pct,1)}%${over?'，满载 100%，超出 '+f(pct-100,1)+'%':''}" data-percent="${pct}" data-scale="${scale}"><i class="${over?'mx-over':''}" style="width:${fill}%"></i>${over?`<span class="mx-limit-marker" style="left:${limit}%" aria-hidden="true"></span>`:''}</div></div>`;
}
function metricValue(value,limit,digits=0){return `<span class="mx-current${value>limit?' mx-over':''}">${f(value,digits)}</span>`}
function control(id,label,values,value){return `<div class="mx-control"><label for="${id}">${label}</label><select id="${id}">${values.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('')}</select></div>`}
function range(id,label,min,max,step,value,unit,scale=1){return `<div class="mx-control"><label for="${id}">${label}</label><div class="mx-range"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}" data-scale="${scale}"><output id="${id}-value" for="${id}">${f(value/scale,1)} ${unit}</output></div></div>`}
function outputChoices(){return `<div class="mx-control"><span id="mx-output-label">输出长度</span><div id="mx-output" class="mx-pills" role="group" aria-labelledby="mx-output-label">${[128,256,512,1024].map(v=>`<button type="button" data-mx-output="${v}" aria-pressed="${v===256}">${f(v)}</button>`).join('')}<span class="mx-output-unit">tokens</span></div></div>`}
function updateOutputs(){panel.querySelectorAll('input[type=range]').forEach(el=>{el.style.setProperty('--mx-progress',100*(Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))+'%');$(el.id+'-value').textContent=f(el.value/Number(el.dataset.scale),1)+' '+el.dataset.unit})}
if(hardware){
 let activeLoad='full',outputLength=1024;
 panel.setAttribute('aria-label','承载边界测试');
 panel.innerHTML=`<div class="mx-presets" role="group" aria-label="业务示例"><button data-mx-load="full" aria-pressed="true" title="固定当前硬件与时延目标，联动并发和请求长度，持续贴近承载边界">满载</button>${Object.entries(capacityPresets).map(([key,p])=>`<button data-mx-load="${key}" aria-pressed="${key===activeLoad}">${p.name}</button>`).join('')}<button data-mx-load="custom" aria-pressed="false">自定义</button></div><div class="mx-controls">${control('mx-model','代表性模型', [['32','32B 稠密模型 · BF16（构造）']],'32')}${outputChoices()}${range('mx-concurrency','总并发请求数',1,1024,1,32,'请求')}${range('mx-input','输入长度',512,65536,512,65536,'tokens')}${range('mx-ttft','首 token 目标',100,60000,100,2000,'ms')}${range('mx-tpot','逐 token 目标',10,200,5,50,'ms/token')}</div><div id="mx-capacity-result" aria-live="polite"></div><details class="mx-method"><summary>构造示例 · 查看估算口径与假设</summary><p>“满载”按当前时延目标联动并发与请求长度：拖动并发时自动寻找可承载的最长输入；改动输入、输出或目标时重新求最大并发。输入以 512 tokens 为步长，并发按完整副本批量对齐。硬件或目标无可行解时保留满载模式并提示，不放宽时延目标。</p><p>本页为简化构造估算，未运行 msModeling 或真实设备任务。</p><p>固定 32B 稠密模型，BF16 权重取 64 GiB；KV 每请求每 token 取 256 KiB（构造常数）。TP 取设备数可整除的 8 / 4 / 2 / 1 中最大值，DP = 设备数 / TP；请求均匀分到各副本，采用最忙副本的向上取整批量。权重与 KV 在 TP 内均匀切分，各单元预留 15% 内存。</p><p>TTFT = 2 × 32×10⁹ × 输入 token × 副本批量 / TP 有效算力 + 20ms；TPOT =（权重字节 + 副本 KV 字节）/ TP 有效内存带宽 + 2 × 32×10⁹ × 副本批量 / TP 有效算力 + 3ms。有效能力为画像峰值 × 对应效率；端到端 = TTFT + 输出 token × TPOT。</p><p>内存边界按每单元容量计算，时延边界同时约束 TTFT 和 TPOT，搜索范围为 1–1,000,000 并发。忽略排队、通信拓扑差异、算子重叠及真实推理引擎调度，不代表实测容量或 P99 保证。用于比较操作趋势，实际结果需后端仿真与同负载测量。</p></details>`;
 function renderCapacity(pinned='input'){
  const target=$('mx-capacity-result');
  let load={input:+$('mx-input').value,output:outputLength,concurrency:+$('mx-concurrency').value,ttft:+$('mx-ttft').value,tpot:+$('mx-tpot').value};
  if(activeLoad==='full'&&!errors.length){
   const balanced=balanceFullLoad(state.profile,state.count,load,pinned==='concurrency'?'concurrency':'input');
   if(balanced.error){updateOutputs();panel.querySelectorAll('[data-mx-output]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.mxOutput===outputLength)));target.innerHTML='<p class="mx-empty" role="status">'+balanced.error+'</p>';return;}
   load=balanced.load;outputLength=load.output;
   $('mx-concurrency').min=balanced.result.dp;
   $('mx-concurrency').step=balanced.result.dp;
   $('mx-concurrency').max=Math.ceil(Math.max(1024,load.concurrency)/balanced.result.dp)*balanced.result.dp;
   for(const k of ['input','concurrency'])$('mx-'+k).value=load[k];
  }
  panel.querySelectorAll('[data-mx-output]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.mxOutput===outputLength)));
  updateOutputs();const r=capacityModel(state.profile,state.count,load);
  if(r.error||errors.length){target.innerHTML='<p class="mx-empty">当前画像参数待补全。请先修正左侧配置中的错误，再探索承载边界。</p>';return;}
  const c=r.current;
  target.innerHTML=`<div class="mx-verdict" data-tone="${r.pass?'good':'bad'}"><strong>${activeLoad==='full'?'满载 · '+r.first+'边界':r.pass?'示例估算可承载':'示例估算不可承载'} · ${f(load.concurrency)} 并发${activeLoad!=='full'&&r.pass?' · 余量 '+f(r.cap-load.concurrency):''}</strong></div><div class="mx-metrics"><div class="mx-metric"><span>单元内存峰值 / 容量</span><strong>${metricValue(c.mem,r.unitMemory,1)} / ${f(r.unitMemory)} GiB</strong>${meter(c.mem,r.unitMemory)}<small>含权重、KV 与 15% 预留 · 内存边界 ${f(r.memoryCap)} 并发</small></div><div class="mx-metric"><span>首 token 时延 / 目标</span><strong>${metricValue(c.ttft,load.ttft)} / ${f(load.ttft)} ms</strong>${meter(c.ttft,load.ttft)}<small>TTFT 与 TPOT 共同决定时延边界</small></div><div class="mx-metric"><span>逐 token 时延 / 目标</span><strong>${metricValue(c.tpot,load.tpot,1)} / ${f(load.tpot)} ms</strong>${meter(c.tpot,load.tpot)}<small>时延边界 ${r.latencyCap===r.searchLimit?'≥ ':''}${f(r.latencyCap)} 并发 · 端到端 ${f(c.e2e,1)} s</small></div></div>`;
 }
 function selectLoad(key){activeLoad=key;if(key!=='full'){$('mx-concurrency').min=1;$('mx-concurrency').step=1;}panel.querySelectorAll('[data-mx-load]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mxLoad===key)));}
 function customizeLoad(e){if(e.target.closest('.mx-controls')&&e.target.matches('input,select')){if(activeLoad!=='full')selectLoad('custom');renderCapacity(e.target.id==='mx-concurrency'?'concurrency':'input');}}
 panel.addEventListener('input',customizeLoad);panel.addEventListener('change',customizeLoad);
 panel.addEventListener('click',e=>{
  const output=e.target.closest('[data-mx-output]');
  if(output){outputLength=+output.dataset.mxOutput;if(activeLoad!=='full')selectLoad('custom');renderCapacity();return;}
  const b=e.target.closest('[data-mx-load]');if(!b)return;
  const key=b.dataset.mxLoad,preset=capacityPresets[key];
  selectLoad(key);
  if(preset){outputLength=preset.output;for(const k of ['input','concurrency','ttft','tpot'])$('mx-'+k).value=preset[k];}
  if(key==='full'){outputLength=1024;$('mx-input').value=65536;}
  renderCapacity();
 });
 document.addEventListener('modeling:hardware-change',renderCapacity);window.addEventListener('resize',renderCapacity);renderCapacity();
}else{
 panel.setAttribute('aria-label','优化行动验证');
 actionController=ModelingActions.mount(panel,{
  getContext:()=>JSON.parse(JSON.stringify({model:modelName(),stack:state.stack,workload:LOADS[state.load],targets:state.targets,selected:state.selected,issues:inputIssues(),candidates:rows().map(r=>({id:r.id,slot:r.slot,tp:r.tp,dp:r.dp,scope:r.scope,hardware_name:environmentName(r.slot),environment:state.environments[r.slot],manualBaseline:r.point?.source==='manual'?{run:r.point.runId,values:r.point.values}:null}))})),
  selectCandidate:id=>selectCandidate(id),
  openCandidates:()=>{mode='legacy';sync();window.dispatchEvent(new Event('resize'));window.scrollTo(0,0);},
  editHardware:slot=>editEnvironment(slot),exportJSON:(name,data)=>saveJson(name,data)
 });
 if(new URLSearchParams(location.hash.slice(1)).has('assessment'))mode='legacy';
}

sync();
})(globalThis);
