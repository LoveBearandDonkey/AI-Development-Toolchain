/* Constructed teaching models. No backend simulation, measurement or profile mutation. */
(function(root){
'use strict';
const GiB=2**30;
const labels=['计算','访存','通信','固定开销'];
const colors=['#4e7cda','#39a38b','#b289d3','#a6b1c1'];
const scenarios={compute:{name:'计算受限',parts:[720,160,80,40],note:'长输入预填充，计算占比 72%。'},memory:{name:'访存受限',parts:[140,700,110,50],note:'小批量解码，访存占比 70%。'},comm:{name:'通信受限',parts:[220,200,540,40],note:'跨节点张量并行，通信占比 54%。'}};
function upgrade(parts,index,factor){return parts.map((v,i)=>i===index?v/factor:v)}
function total(parts){return parts.reduce((a,b)=>a+b,0)}
function bottleneck(parts){return parts.slice(0,3).indexOf(Math.max(...parts.slice(0,3)))}
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
const api={capacityModel,upgrade,total,bottleneck,scenarios};
if(typeof module==='object'&&module.exports)module.exports=api;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),f=(n,d=0)=>Number(n).toLocaleString('zh-CN',{maximumFractionDigits:d});
const hardware=!!document.querySelector('main.workbench');
let mode='explore';
const bar=document.createElement('nav');bar.className='mx-switch';bar.setAttribute('aria-label',hardware?'硬件工作视图':'评估工作视图');
bar.innerHTML=`<button data-mx-mode="explore" aria-pressed="true">${hardware?'业务承载边界':'升级收益预演'}</button><button data-mx-mode="legacy" aria-pressed="false">${hardware?'硬件布局与参数':'候选方案与验证'}</button><span>构造示例 · 用操作探索业务判断</span>`;
document.querySelector('header').after(bar);
const panel=document.createElement('section');panel.className='mx-panel'+(hardware?'':' mx-upgrade');panel.id='mx-explorer';
let legacy;
if(hardware){const stage=document.querySelector('.stage'),wrap=document.createElement('div');wrap.className='mx-layout';wrap.id='mx-hardware-layout';while(stage.firstChild)wrap.append(stage.firstChild);stage.append(wrap,panel);legacy=[wrap];}
else{bar.after(panel);legacy=[...document.querySelectorAll('.steps,main.page')];}
function sync(){const evidence=document.body.dataset.evidenceOpen==='true';bar.hidden=evidence;panel.hidden=evidence||mode!=='explore';legacy.forEach(el=>el.hidden=evidence||mode==='explore');if(hardware)document.querySelector('.stage').classList.toggle('mx-exploring',mode==='explore');bar.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mxMode===mode)));}
bar.addEventListener('click',e=>{const b=e.target.closest('[data-mx-mode]');if(!b)return;mode=b.dataset.mxMode;sync();window.dispatchEvent(new Event('resize'));});
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-evidence-open']});
document.querySelector('#user-evidence')?.addEventListener('click',e=>{if(e.target.closest('[data-evidence-target]')){mode='legacy';sync();}});
function meter(value,max){const pct=value/max*100;return `<div class="mx-meter"><i class="${pct>100?'mx-over':''}" style="width:${Math.min(100,pct)}%"></i></div>`}
function control(id,label,values,value){return `<div class="mx-control"><label for="${id}">${label}</label><select id="${id}">${values.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('')}</select></div>`}
function range(id,label,min,max,step,value,unit){return `<div class="mx-control"><label for="${id}">${label}<output id="${id}-value" for="${id}">${f(value)} ${unit}</output></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}"></div>`}
function updateOutputs(){panel.querySelectorAll('input[type=range]').forEach(el=>$(el.id+'-value').textContent=f(el.value)+' '+el.dataset.unit)}
if(hardware){
 panel.setAttribute('aria-label','业务承载边界探索');
 panel.innerHTML=`<div class="mx-kicker">CAPACITY EXPLORER</div><h2>这套硬件，能接多大的业务？</h2><span class="mx-tag">构造示例 / 简化估算，未运行 msModeling</span><p class="mx-intro">保持这套硬件不变，拖动并发与请求长度，找到业务的第一条边界。</p><div id="mx-hardware" class="mx-context"></div><div class="mx-presets" role="group" aria-label="业务示例"><button data-mx-load="qa" aria-pressed="true">标准问答 · 2K 输入</button><button data-mx-load="long" aria-pressed="false">长上下文 · 32K 输入</button></div><div class="mx-controls">${control('mx-model','代表性模型', [['32','32B 稠密模型 · BF16（构造）']],'32')}${control('mx-output','输出长度', [['128','128 tokens'],['256','256 tokens'],['512','512 tokens'],['1024','1,024 tokens']],'256')}${range('mx-concurrency','总并发请求数',1,1024,1,32,'请求')}${range('mx-input','单请求输入长度',512,65536,512,2048,'tokens')}${range('mx-ttft','首 token 时延目标',100,60000,100,2000,'ms')}${range('mx-tpot','逐 token 时延目标',10,200,5,50,'ms/token')}</div><div id="mx-capacity-result" aria-live="polite"></div><details class="mx-method"><summary>查看构造口径与计算假设</summary><p>固定 32B 稠密模型，BF16 权重取 64 GiB；KV 每请求每 token 取 256 KiB（构造常数）。TP 取设备数可整除的 8 / 4 / 2 / 1 中最大值，DP = 设备数 / TP；请求均匀分到各副本，采用最忙副本的向上取整批量。权重与 KV 在 TP 内均匀切分，各单元预留 15% 内存。</p><p>TTFT = 2 × 32×10⁹ × 输入 token × 副本批量 / TP 有效算力 + 20ms；TPOT =（权重字节 + 副本 KV 字节）/ TP 有效内存带宽 + 2 × 32×10⁹ × 副本批量 / TP 有效算力 + 3ms。有效能力为画像峰值 × 对应效率；端到端 = TTFT + 输出 token × TPOT。</p><p>内存边界按每单元容量计算，时延边界同时约束 TTFT 和 TPOT，搜索范围为 1–1,000,000 并发。忽略排队、通信拓扑差异、算子重叠及真实推理引擎调度，不代表实测容量或 P99 保证。用于比较操作趋势，实际结果需后端仿真与同负载测量。</p></details>`;
 function renderCapacity(){updateOutputs();const target=$('mx-capacity-result');$('mx-hardware').textContent=state.profile.name+' · '+f(state.count)+' 个设备单元 · '+f(state.profile.memory_size_bytes/GiB)+' GiB / 单元';
  const load={input:+$('mx-input').value,output:+$('mx-output').value,concurrency:+$('mx-concurrency').value,ttft:+$('mx-ttft').value,tpot:+$('mx-tpot').value};
  const r=capacityModel(state.profile,state.count,load);
  if(r.error||errors.length){target.innerHTML='<p class="mx-empty">当前画像参数待补全。请先修正左侧配置中的错误，再探索承载边界。</p>';return;}
  const c=r.current,excess=load.concurrency-r.cap;
  const fails=[c.mem>r.unitMemory?'内存容量超限':'',c.ttft>load.ttft?'TTFT 超过目标':'',c.tpot>load.tpot?'TPOT 超过目标':''].filter(Boolean);
  target.innerHTML=`<div class="mx-verdict" data-tone="${r.pass?'good':'bad'}"><strong>${r.pass?'示例估算可承载':'示例估算不可承载'} · 当前 ${f(load.concurrency)} 并发</strong><p>${r.cap===0?'当前模型或时延目标下，没有可承载的正并发。':`本负载的示例上限为 ${f(r.cap)} 并发，${r.memoryCap===r.latencyCap?'内存与时延同时触及边界':r.first+'先到边界'}。`}${r.pass?`还可增加 ${f(r.cap-load.concurrency)} 个并发（余量 ${f((r.cap-load.concurrency)/Math.max(1,r.cap)*100)}%）。`:`${fails.join('；')}；需至少减少 ${f(excess)} 个并发，或调整请求长度 / 目标。`}</p></div><div class="mx-context">固定策略：TP ${r.tp} × DP ${r.dp} · 最忙副本 ${Math.ceil(load.concurrency/r.dp)} 请求 · 输出 ${f(load.output)} tokens</div><div class="mx-metrics"><div class="mx-metric"><span>单元内存峰值 / 容量</span><strong>${f(c.mem,1)} / ${f(r.unitMemory)} GiB</strong>${meter(c.mem,r.unitMemory)}<small>含权重、KV 与 15% 预留 · 内存边界 ${f(r.memoryCap)} 并发</small></div><div class="mx-metric"><span>首 token 时延 / 目标</span><strong>${f(c.ttft)} / ${f(load.ttft)} ms</strong>${meter(c.ttft,load.ttft)}<small>TTFT 与 TPOT 共同决定时延边界</small></div><div class="mx-metric"><span>逐 token 时延 / 目标</span><strong>${f(c.tpot,1)} / ${f(load.tpot)} ms</strong>${meter(c.tpot,load.tpot)}<small>时延边界 ${r.latencyCap===r.searchLimit?'≥ ':''}${f(r.latencyCap)} 并发 · 端到端 ${f(c.e2e,1)} s</small></div></div><div class="mx-card"><h3>业务增长到哪里，需要调整？</h3><div id="mx-boundary-chart"></div><p>${r.first==='内存'?'缩短上下文或减少并发可以减少 KV 占用；增加算力不能直接解决内存容量超限。':'先检查首 token 与逐 token 时延的超限项；内存尚有余量，也可能因响应变慢而无法继续接入请求。'}拖动滑条，观察蓝色位置与两条边界的距离。</p></div>`;
  const max=Math.max(load.concurrency,r.cap*1.25,64),cw=Math.max(320,Math.min(710,target.clientWidth-40)),right=cw-35,x=v=>30+Math.min(v,max)/max*(right-30);
  $('mx-boundary-chart').innerHTML=`<svg class="mx-chart" viewBox="0 0 ${cw} 155" role="img" aria-label="当前并发 ${load.concurrency}，内存边界 ${r.memoryCap}，时延边界 ${r.latencyCap}"><rect x="30" y="32" width="${right-30}" height="38" rx="6" fill="#f1f3f7"/><rect x="30" y="32" width="${Math.max(0,x(r.cap)-30)}" height="38" rx="6" fill="#d6efe5"/>${[[r.memoryCap,'内存','#a56f37',98],[r.latencyCap,'时延','#9169b1',124]].map(([v,t,color,y])=>`<line x1="${x(v)}" x2="${x(v)}" y1="28" y2="${y-15}" stroke="${color}" stroke-dasharray="4 3"/><text x="${Math.min(right-120,Math.max(30,x(v)-25))}" y="${y}" fill="${color}" font-size="13">${t} ${f(v)}${v>max?'（图外）':''}</text>`).join('')}<circle cx="${x(load.concurrency)}" cy="51" r="7" fill="#2563eb"/><text x="30" y="20" font-size="12" fill="#637083">0</text><text x="${right}" y="20" text-anchor="end" font-size="12" fill="#637083">${f(max)} 并发</text></svg>`;
 }
 panel.addEventListener('input',e=>{if(e.target.matches('input,select')){if(e.target.id==='mx-input')panel.querySelectorAll('[data-mx-load]').forEach(b=>b.setAttribute('aria-pressed','false'));renderCapacity();}});
 panel.addEventListener('change',e=>{if(e.target.matches('select'))renderCapacity()});
 panel.addEventListener('click',e=>{const b=e.target.closest('[data-mx-load]');if(!b)return;const long=b.dataset.mxLoad==='long';$('mx-input').value=long?32768:2048;$('mx-output').value='256';$('mx-concurrency').value=32;panel.querySelectorAll('[data-mx-load]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));renderCapacity();});
 document.addEventListener('modeling:hardware-change',renderCapacity);window.addEventListener('resize',renderCapacity);renderCapacity();
}else{
 panel.setAttribute('aria-label','升级收益预演');
 panel.innerHTML=`<div class="mx-kicker">UPGRADE WHAT-IF</div><h1>想让业务更快，先改善什么才有用？</h1><span class="mx-tag">构造场景 / 收益演示，未运行仿真或设备任务</span><p class="mx-intro">对同一个工作负载，只改变一项资源能力，比较端到端收益与下一处瓶颈。</p><div class="mx-presets" role="group" aria-label="瓶颈示例">${Object.entries(scenarios).map(([key,s])=>`<button data-mx-scenario="${key}" aria-pressed="${key==='compute'}">${s.name}</button>`).join('')}</div><div class="mx-upgrade-grid"><div><div class="mx-controls"><div class="mx-control"><label>选择一项改善</label><div class="mx-choice" role="group" aria-label="改善资源">${['算力更强','内存带宽更高','互连更快'].map((s,i)=>`<button data-mx-resource="${i}" aria-pressed="${i===0}">${s}</button>`).join('')}</div></div>${range('mx-factor','能力提升幅度',100,800,10,200,'%')}<p class="mx-context">100% = 基线能力；200% = 能力翻倍。仅调整选中资源，工作量与其他资源保持不变。</p><button id="mx-restore">恢复基线比较</button></div><details class="mx-method"><summary>构造数据与计算假设</summary><p>三组场景均为构造的单请求分解，基线总计 1,000ms。计算 / 访存 / 通信 / 固定开销分别为：计算场景 720 / 160 / 80 / 40ms；访存场景 140 / 700 / 110 / 50ms；通信场景 220 / 200 / 540 / 40ms。</p><p>假设四部分串行相加，无重叠。所选部分耗时 = 原耗时 / 能力倍率，固定开销保持不变。“互连更快”表示通信有效服务能力整体提升。瓶颈按三种资源耗时中的最大项判断。曲线是同一公式在不同倍率下的结果，不含采购价格与成本回收评估。</p><p>此视图独立于候选表与实测回填，不将构造值写入验证结论。真实升级需在具体模型、并行策略与拓扑下重新仿真并实测。</p></details></div><div><div class="mx-context" id="mx-scenario-note"></div><div class="mx-comparison" id="mx-comparison"></div><div id="mx-upgrade-verdict" aria-live="polite"></div><div class="mx-card"><h3>继续投入，收益还明显吗？</h3><div id="mx-return-chart"></div><p id="mx-marginal"></p></div><div class="mx-card"><h3>同样提升幅度，哪项最有效？</h3><div id="mx-resource-ranking"></div><div class="mx-actions"><button id="mx-best">试试收益最大的一项</button><button id="mx-candidates">进入候选方案与验证</button><a href="硬件画像.html">返回承载边界</a></div></div></div></div>`;
 let scenario='compute',resource=0;
 function renderUpgrade(){updateOutputs();const s=scenarios[scenario],factor=+$('mx-factor').value/100,after=upgrade(s.parts,resource,factor),base=total(s.parts),now=total(after),saving=base-now,beforeB=bottleneck(s.parts),afterB=bottleneck(after);
  $('mx-scenario-note').textContent=s.note+' 固定基线 1,000 ms · 资源能力 '+f(factor,1)+'×';
  $('mx-comparison').innerHTML=[['当前方案 · 基线',s.parts],['变化后方案',after]].map(([name,parts])=>`<div class="mx-card"><h3>${name}</h3><strong class="mx-time">${f(total(parts))} <small>ms</small></strong><p>主要瓶颈：${labels[bottleneck(parts)]}</p>${parts.map((v,i)=>`<div class="mx-phase-row"><span>${labels[i]}</span><div class="mx-phase-track"><i style="width:${v/base*100}%;--swatch:${colors[i]}"></i></div><b>${f(v)} ms</b></div>`).join('')}</div>`).join('');
  $('mx-upgrade-verdict').innerHTML=`<div class="mx-verdict"><strong>端到端减少 ${f(saving)} ms · 耗时降低 ${f(saving/base*100,1)}%</strong><p>${factor===1?'当前与基线一致，选择资源并拖动提升幅度开始比较。':`${labels[resource]}能力提升至 ${f(factor,1)}×，整体加速 ${f(base/now,2)}×。${beforeB===afterB?'主要瓶颈仍在'+labels[afterB]+'。':'主要瓶颈从'+labels[beforeB]+'转移到'+labels[afterB]+'。'}`}</p></div>`;
  const twice=total(upgrade(s.parts,resource,factor*2)),remaining=base-s.parts[resource];
  $('mx-marginal').textContent=`将当前 ${labels[resource]}能力再翻倍（${f(factor,1)}× → ${f(factor*2,1)}×），还能减少 ${f(now-twice)} ms，相对当前降低 ${f((now-twice)/now*100,1)}%。即使这一部分无限加速，其他部分仍需 ${f(remaining)} ms。`;
  const cw=Math.max(320,Math.min(710,$('mx-return-chart').clientWidth)),right=cw-30,x=v=>30+(v-1)/7*(right-30),y=v=>166-v/base*138;
  const points=Array.from({length:71},(_,i)=>{const v=1+i/10;return `${x(v)},${y(total(upgrade(s.parts,resource,v)))}`}).join(' ');
  $('mx-return-chart').innerHTML=`<svg class="mx-chart" viewBox="0 0 ${cw} 215" role="img" aria-label="${labels[resource]}能力从 1 倍到 8 倍的端到端耗时曲线，当前 ${f(now)} ms"><line x1="30" x2="${right}" y1="166" y2="166" stroke="#cdd7e5"/><line x1="30" x2="${right}" y1="${y(remaining)}" y2="${y(remaining)}" stroke="#c0c9d5" stroke-dasharray="4 4"/><polyline points="${points}" fill="none" stroke="#4e7cda" stroke-width="3"/><circle cx="${x(factor)}" cy="${y(now)}" r="6" fill="#2563eb"/><text x="30" y="16" font-size="12" fill="#637083">耗时 ms · 基线 1,000</text><text x="${x(factor)+(factor>4?-10:10)}" text-anchor="${factor>4?'end':'start'}" y="${y(now)-10}" font-size="13" fill="#2563eb">当前 ${f(now)} ms</text>${[1,2,4,8].map(v=>`<text x="${x(v)}" y="190" text-anchor="middle" font-size="12" fill="#637083">${v}×</text>`).join('')}<text x="${right}" y="211" text-anchor="end" font-size="12" fill="#637083">所选资源能力倍率</text></svg>`;
  const gains=s.parts.slice(0,3).map((v,i)=>({i,gain:v-v/factor})).sort((a,b)=>b.gain-a.gain);
  $('mx-resource-ranking').innerHTML=gains.map(({i,gain})=>`<div class="mx-phase-row"><span>${labels[i]}</span><div class="mx-phase-track"><i style="width:${gain/base*100}%;--swatch:${colors[i]}"></i></div><b>−${f(gain)} ms</b></div>`).join('');
  panel.querySelectorAll('[data-mx-resource]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.mxResource===resource)));
  panel.querySelectorAll('[data-mx-scenario]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mxScenario===scenario)));
 }
 panel.addEventListener('input',e=>{if(e.target.id==='mx-factor')renderUpgrade()});
 panel.addEventListener('click',e=>{const s=e.target.closest('[data-mx-scenario]'),r=e.target.closest('[data-mx-resource]');if(s){scenario=s.dataset.mxScenario;resource=bottleneck(scenarios[scenario].parts);$('mx-factor').value=200;}if(r)resource=+r.dataset.mxResource;if(e.target.id==='mx-restore')$('mx-factor').value=100;if(e.target.id==='mx-best'){resource=bottleneck(scenarios[scenario].parts);if(+$('mx-factor').value===100)$('mx-factor').value=200;}if(e.target.id==='mx-candidates'){mode='legacy';sync();window.scrollTo(0,0);}if(s||r||['mx-restore','mx-best'].includes(e.target.id))renderUpgrade();});
 // A hardware handoff must return to the candidate workflow that owns that environment.
 if(new URLSearchParams(location.hash.slice(1)).has('assessment'))mode='legacy';
 window.addEventListener('resize',renderUpgrade);renderUpgrade();
}
sync();
})(globalThis);
