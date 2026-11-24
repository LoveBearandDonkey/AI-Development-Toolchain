/* Action planning and paired measurement. Does not execute jobs or modify model code. */
(function(root){
'use strict';
const recipes={
 hardware:{name:'更换硬件环境',kind:'硬件',where:'设备采购 / 调度资源池与部署配置',prerequisite:'目标环境真实可用，模型、精度和推理后端均兼容；先核对设备粒度、内存与拓扑。',steps:['选择右侧的改动后候选，使用其实际设备画像、设备数量和 TP / DP 配置部署。','记录具体设备型号、设备数量、拓扑及运行软件栈。画像参数只描述设备，不能靠改大算力或带宽数值获得真实收益。','先在原环境测基线，再在目标环境用相同请求集测量。若数量或 TP / DP 同时改变，结果归因于整体方案变更。'],evidence:'设备清单、部署配置、两次运行记录；同时记录租用 / 采购成本。',metric:'观察 TTFT、TPOT、QPS 与单元内存；收益可能来自硬件、数量和并行策略的共同变化。'},
 parallel:{name:'调整 TP / DP',kind:'部署配置',where:'推理服务启动配置中的 TP / DP 参数',prerequisite:'硬件与设备数量保持一致，候选满足 TP × DP = 设备数量；后端还需检查模型维度与并行支持。',steps:['选择同一环境下不同的 TP / DP 候选。','在实际推理服务的启动配置中修改 TP / DP，并保存修改前后的配置或 commit。具体参数名需按所用后端确认。','保持模型、精度、请求长度、总并发及设备集合一致，重新运行同一压测；同时查看通信耗时和内存变化。'],evidence:'启动配置差异、真实 rank 映射、通信耗时记录与压测报告。',metric:'检查通信减少是否换来了 QPS 或时延改善，以及单元内存是否超限。',source:['vLLM 并行部署说明','https://docs.vllm.ai/en/stable/serving/parallelism_scaling/']},
 fusion:{name:'融合热点算子',kind:'代码',where:'模型前向中的热点算子链 / 后端编译与融合配置',prerequisite:'先提供算子时间线，确认确有重复 kernel 启动或中间张量读写；所用 NPU 后端需支持对应融合实现。',steps:['从 profiler 记录定位一条具体热点算子链，记录算子名、Shape、dtype 与调用次数。','在模型前向中替换为后端支持的等价融合实现，或启用后端已验证的编译 / 融合配置；保存代码 diff 或 commit。','核对数值精度与输出质量，再比较 kernel 数、中间张量读写和端到端压测；仅 kernel 变快不能认定业务收益。'],evidence:'热点算子记录、代码 diff、正确性对照与改动后的 profiler 记录。',metric:'融合可能减少启动和中间访存开销；实际收益需测量，不能等同于峰值算力翻倍。',source:['PyTorch 性能调优：算子融合','https://docs.pytorch.org/tutorials/recipes/recipes/tuning_guide.html']},
 copies:{name:'减少重复数据搬运',kind:'代码',where:'模型前向 / 输入预处理中的重复转换与拷贝',prerequisite:'时间线中能定位重复 cast、布局转换或 Host / Device 拷贝；先确认这些操作是否语义必需。',steps:['定位一处重复数据转换或拷贝，记录源 / 目标 dtype、布局、设备与调用次数。','在明确等价的前提下合并重复转换、复用已转换张量，或将必要转换移出重复路径；保存具体代码 diff。','验证生命周期、同步与数值正确性，测量拷贝次数 / 字节数、访存耗时及端到端指标。'],evidence:'重复操作位置、改动 diff、正确性与访存 / 拷贝前后对照。',metric:'目标是减少实际搬运工作量；不是在画像里调高物理内存带宽。'},
 placement:{name:'调整绑卡与通信映射',kind:'启动脚本',where:'启动脚本的 rank → device → node 映射',prerequisite:'具备真实节点与高速互连域清单；若希望 TP 组位于单个高速域，该域必须容纳整个 TP 组。',steps:['记录当前每个 rank 所在的节点、设备和互连域。','保持设备数、TP / DP 与模型不变，在实际启动 / 调度配置中调整绑卡映射；页面不会自动重接物理链路。','用同一请求集复测，核对跨域通信次数、集合通信耗时与端到端表现。'],evidence:'真实拓扑清单、前后 rank 映射、启动脚本 diff 与通信分析报告。',metric:'检查通信路径变化的实际效果；画像里的逻辑 Rank 图不能替代真实布线信息。'}
};
const metrics=[['qps','QPS','req/s'],['ttft','平均 TTFT','ms'],['tpot','平均 TPOT','ms/token'],['memory','单元内存峰值','GiB']];
function evaluatePair(before,after,targets,capacity,confirmed,changeId){
 const issues=[];
 for(const [label,point] of [['改动前',before],['改动后',after]]){
  if(!point.run?.trim())issues.push(label+'需要运行记录标识。');
  for(const [k,name] of metrics)if(!Number.isFinite(Number(point.values?.[k]))||Number(point.values[k])<=0)issues.push(label+'的'+name+'需为有限正数。');
 }
 if(before.run?.trim()&&before.run.trim()===after.run?.trim())issues.push('前后需使用不同的运行记录标识。');
 if(!changeId?.trim())issues.push('请记录实际改动的配置 / diff / commit 标识。');
 if(!confirmed)issues.push('请先核对同一请求集、测量口径和正确性。');
 if(!Number.isFinite(capacity)||capacity<=0||metrics.some(([k])=>!Number.isFinite(targets[k])||targets[k]<=0))issues.push('当前业务目标或设备容量无效。');
 if(issues.length)return {issues};
 const b=Object.fromEntries(metrics.map(([k])=>[k,Number(before.values[k])])),a=Object.fromEntries(metrics.map(([k])=>[k,Number(after.values[k])])),memoryLimit=Math.min(targets.memory,capacity);
 const changes=Object.fromEntries(metrics.map(([k])=>[k,(a[k]/b[k]-1)*100]));
 const passes={qps:a.qps>=targets.qps,ttft:a.ttft<=targets.ttft,tpot:a.tpot<=targets.tpot,memory:a.memory<=memoryLimit};
 const regressions=['qps','ttft','tpot'].filter(k=>k==='qps'?a[k]<b[k]:a[k]>b[k]);
 const improved=['qps','ttft','tpot'].some(k=>k==='qps'?a[k]>b[k]:a[k]<b[k]);
 return {issues:[],changes,passes,regressions,improved,memoryLimit,allPassed:Object.values(passes).every(Boolean),before:b,after:a};
}
const api={recipes,evaluatePair};
if(typeof module==='object'&&module.exports)module.exports=api;
root.ModelingActions=api;
if(typeof document==='undefined')return;
api.mount=function(panel,bridge){
 const $=id=>panel.querySelector('#'+id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fmt=(v,d=1)=>Number(v).toLocaleString('zh-CN',{maximumFractionDigits:d});
 const clone=v=>JSON.parse(JSON.stringify(v));
 let context,base,target,action='hardware',drafts=new Map(),key='',draft;
 const emptyPoint=()=>({run:'',values:Object.fromEntries(metrics.map(([k])=>[k,'']))});
 const candidateLabel=r=>r.id+' · '+r.hardware_name+' · '+r.environment.deployment.num_devices+' 单元 · TP '+r.tp+' / DP '+r.dp;
 panel.innerHTML=`<div class="ma-scope"><label for="ma-base">改动前候选</label><select id="ma-base"></select><button id="ma-candidates">返回候选方案与验证</button></div><div id="ma-load" class="ma-load"></div><div class="ma-layout"><aside><h3>选择要实施的动作</h3><div class="ma-action-list">${Object.entries(recipes).map(([id,r])=>`<button data-ma-action="${id}" aria-pressed="${id===action}"><small>${r.kind}</small>${r.name}</button>`).join('')}</div></aside><div><div class="ma-target"><label for="ma-target">改动后候选</label><select id="ma-target"></select><button id="ma-hardware">查看目标硬件画像</button></div><div id="ma-recipe"></div></div></div><section class="ma-experiment"><h3>同一负载，先测基线，再测实际改动</h3><label class="ma-change">实际改动记录<input id="ma-change" type="text" placeholder="启动配置 diff、代码 commit 或设备变更单标识"></label><label class="ma-change">瓶颈线索 / profiler 记录<input id="ma-evidence" type="text" placeholder="填写热点算子、通信记录或硬件约束；尚未提供时仅作为待验证假设"></label><div class="ma-measurements">${[['before','改动前实测'],['after','改动后实测']].map(([id,label])=>`<fieldset><legend>${label}</legend><label>运行记录<input id="ma-${id}-run" type="text" placeholder="运行 ID / 原始报告标识"></label>${metrics.map(([k,name,unit])=>`<label>${name}<span><input id="ma-${id}-${k}" type="number" min="0" step="any" inputmode="decimal"><small>${unit}</small></span></label>`).join('')}</fieldset>`).join('')}</div><div class="ma-baseline-actions"><button id="ma-import">带入当前候选的手工实测</button><span id="ma-import-note"></span></div><label class="ma-confirm"><input id="ma-confirm" type="checkbox">已核对同一请求集、模型精度、预热 / 采样口径与输出正确性；除本动作明确列出的变更外，其他条件一致。</label><div class="ma-buttons"><button id="ma-evaluate" class="primary">根据录入实测核对收益</button><button id="ma-export">导出改动与验证计划</button></div><div id="ma-status" role="status" aria-live="polite"></div><div id="ma-results"></div><p class="ma-limit">本页不执行设备任务。录入报告尚未经页面核验；尾延迟、稳定性、质量与成本仍需单独确认。编辑框仅保留本次页面会话的草稿，可导出保存。</p></section>`;
 function read(){draft.before=readPoint('before');draft.after=readPoint('after');draft.change=$('ma-change').value;draft.evidence=$('ma-evidence').value;draft.confirmed=$('ma-confirm').checked;}
 function readPoint(id){return {run:$('ma-'+id+'-run').value,values:Object.fromEntries(metrics.map(([k])=>[k,$('ma-'+id+'-'+k).value]))};}
 function showDraft(){for(const id of ['before','after']){$('ma-'+id+'-run').value=draft[id].run;for(const [k] of metrics)$('ma-'+id+'-'+k).value=draft[id].values[k];}$('ma-change').value=draft.change;$('ma-evidence').value=draft.evidence;$('ma-confirm').checked=draft.confirmed;$('ma-status').textContent='尚未形成收益结论：完成实际改动后，录入两次测量。';$('ma-results').innerHTML='';}
 function possibleTargets(){if(!base)return [];return context.candidates.filter(r=>action==='hardware'?r.slot!==base.slot:action==='parallel'?r.slot===base.slot&&r.tp!==base.tp:r.id===base.id);}
 function setScope(){
  const choices=possibleTargets();target=choices.find(r=>r.id===$('ma-target').value)||choices[0];
  $('ma-target').innerHTML=choices.map(r=>`<option value="${esc(r.id)}" ${r.id===target?.id?'selected':''}>${esc(candidateLabel(r))}</option>`).join('')||'<option>当前没有可用的改动后候选，请先配置环境</option>';
  $('ma-target').disabled=action!=='hardware'&&action!=='parallel'||!target;
  $('ma-hardware').hidden=action!=='hardware';$('ma-hardware').disabled=!target;
  const next=JSON.stringify({scope:base?.scope,after:target?.scope,action,targets:context.targets});
  if(next!==key){key=next;if(!drafts.has(key))drafts.set(key,{before:emptyPoint(),after:emptyPoint(),change:'',evidence:'',confirmed:false});draft=drafts.get(key);showDraft();}
  renderRecipe();
 }
 function renderRecipe(){const r=recipes[action];
  const scopeChanges=base&&target?[
   ['硬件',base.hardware_name,target.hardware_name],['设备数',base.environment.deployment.num_devices,target.environment.deployment.num_devices],['TP / DP',base.tp+' / '+base.dp,target.tp+' / '+target.dp],['代码 / 启动配置','当前版本',action==='hardware'||action==='parallel'?'记录随部署变化的配置':'需要实际 diff / commit']
  ]:[];
  $('ma-recipe').innerHTML=`<h3>${esc(r.name)}：具体改哪里</h3><dl class="ma-details"><dt>改动位置</dt><dd>${esc(r.where)}</dd><dt>先确认</dt><dd>${esc(r.prerequisite)}</dd></dl><ol>${r.steps.map(s=>'<li>'+esc(s)+'</li>').join('')}</ol><div class="ma-diff"><div class="ma-diff-head"><span>改动项</span><span>改动前</span><span>改动后</span></div>${scopeChanges.map(([label,a,b])=>`<div><span>${label}</span><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div><p><b>需要的证据：</b>${esc(r.evidence)}</p><p><b>如何判断：</b>${esc(r.metric)}</p>${r.source?`<a href="${r.source[1]}" target="_blank" rel="noopener noreferrer">${r.source[0]}</a><p class="ma-limit">参考原理；实际接口与支持范围按所用 NPU 推理后端确认。</p>`:''}`;
  panel.querySelectorAll('[data-ma-action]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.maAction===action)));
  const manual=base?.manualBaseline;$('ma-import').disabled=!manual;$('ma-import-note').textContent=manual?'可带入记录 '+manual.run+'；不会自动替你核对改动后的条件。':'当前候选尚无手工实测；构造值不作为收益基线。';
  const disabled=!base||!target||context.issues.length>0;$('ma-evaluate').disabled=disabled;$('ma-export').disabled=disabled;
 }
 function refresh(){
  context=bridge.getContext();base=context.candidates.find(r=>r.id===context.selected)||context.candidates[0];
  $('ma-base').innerHTML=context.candidates.map(r=>`<option value="${esc(r.id)}" ${r.id===base?.id?'selected':''}>${esc(candidateLabel(r))}</option>`).join('')||'<option>请先配置有效环境</option>';
  $('ma-load').textContent=context.issues.length?context.issues.join('；'):context.model+' · '+context.workload.input+' 输入 / '+context.workload.output+' 输出 · 总并发 '+context.workload.concurrency+' · '+context.stack+' · 本页尚未运行压测';
  setScope();
 }
 function evaluate(){read();return evaluatePair(draft.before,draft.after,context.targets,target.environment.device_profile.memory_size_bytes/2**30,draft.confirmed,draft.change);}
 function displayResult(result){
  if(result.issues.length){$('ma-status').textContent=result.issues.join(' ');$('ma-results').innerHTML='';return;}
  const outcome=!result.allPassed?'改动后仍有指标未达业务目标':result.regressions.length?'存在性能退化，需要权衡或回退':result.improved?'录入结果显示收益，保留为后续验证对象':'前后未见性能改善，暂不认定有收益';
  $('ma-status').textContent=outcome+'。依据用户录入，报告未核验；不代表完成生产部署验收。';
  $('ma-results').innerHTML=`<div class="ma-table"><table><thead><tr><th>指标</th><th>改动前</th><th>改动后</th><th>相对变化</th><th>改动后目标</th></tr></thead><tbody>${metrics.map(([k,name,unit])=>`<tr><th>${name}</th><td>${fmt(result.before[k])} ${unit}</td><td>${fmt(result.after[k])} ${unit}</td><td>${result.changes[k]>0?'+':''}${fmt(result.changes[k])}%</td><td class="${result.passes[k]?'ma-pass':'ma-fail'}">${k==='qps'?'≥':'≤'} ${fmt(k==='memory'?result.memoryLimit:context.targets[k])} · ${result.passes[k]?'达标':'未达标'}</td></tr>`).join('')}</tbody></table></div>`;
 }
 function exportPlan(){read();const checked=evaluate();bridge.exportJSON('优化动作验证-'+base.id+'-'+action+'.json',{
  schema:'msmodeling-action-validation/v1',execution:'not_executed_by_page',kind:checked.issues.length?'draft_plan':'user_entered_comparison',
  action:{id:action,...clone(recipes[action]),change_record:draft.change,profiler_evidence:draft.evidence},
  fixed_conditions:{model:context.model,precision:'BF16',workload:clone(context.workload),baseline_stack:context.stack,targets:clone(context.targets)},
  before_configuration:clone(base),after_configuration:clone(target),measurements:clone({before:draft.before,after:draft.after}),
  user_confirmed_comparability:draft.confirmed,comparison:checked.issues.length?null:checked,missing:checked.issues,
  run_protocol:['保存改动前配置与软件版本；固定请求集、精度、并发、预热和采样口径。','在实际设备执行基线测试，记录原始指标与运行 ID。','仅实施计划列出的改动，记录配置 / 代码 diff、设备与软件版本。','核对输出正确性，执行同一压测并保留改动后报告。','回填两次实测，检查性能收益、所有业务门槛与退化项。'],
  uncovered:['原始报告核验','P99 尾延迟','持续稳定性','质量评估','成本与回收周期'],
  note:'Draft/export only. No actual hardware, launch script or model code has been changed by this page.'
 });$('ma-status').textContent='已导出改动项、前后配置、压测步骤'+(checked.issues.length?'与待补证据。':'和用户录入对照。');}
 panel.addEventListener('input',e=>{if(e.target.closest('.ma-experiment')){read();$('ma-status').textContent='输入已修改，请重新核对收益。';$('ma-results').innerHTML='';}});
 panel.addEventListener('change',e=>{if(e.target.id==='ma-base'){bridge.selectCandidate(e.target.value);refresh();}if(e.target.id==='ma-target')setScope();});
 panel.addEventListener('click',e=>{const a=e.target.closest('[data-ma-action]');if(a){action=a.dataset.maAction;setScope();}if(e.target.id==='ma-candidates')bridge.openCandidates();if(e.target.id==='ma-hardware'&&target)bridge.editHardware(target.slot);if(e.target.id==='ma-evaluate')displayResult(evaluate());if(e.target.id==='ma-export'&&base&&target)exportPlan();if(e.target.id==='ma-import'&&base?.manualBaseline){draft.before=clone(base.manualBaseline);showDraft();}});
 refresh();return {refresh};
};
})(globalThis);
