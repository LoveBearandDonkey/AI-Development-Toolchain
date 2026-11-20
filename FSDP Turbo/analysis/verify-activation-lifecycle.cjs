/* DOM and event-model checks only; no browser layout or screenshot validation. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {parseHTML}=require(path.join(process.env.TEMP||process.env.TMP,'mindstudio-ux-mvp-qa/node_modules/linkedom'));
const htmlPath=path.resolve(__dirname,'../重计算与Swap-激活生命周期.html');
const html=fs.readFileSync(htmlPath,'utf8'),code=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const {window}=parseHTML(html),document=window.document;
let viewport=1000,frame;
window.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,width:viewport,height:236}};
window.HTMLElement.prototype.setPointerCapture=function(){};
const sandbox={document,window,console,requestAnimationFrame(fn){frame=fn;return 1}};
Object.defineProperty(sandbox,'location',{get(){return {href:'file:///activation-lifecycle.html'}},set(){throw Error('Unexpected navigation')},configurable:false});
const ctx=vm.createContext(sandbox);
vm.runInContext(code,ctx,{filename:htmlPath});
const evaluate=js=>vm.runInContext(js,ctx),q=s=>document.querySelector(s),checks=[];
function check(name,fn){fn();checks.push(name)}
function click(selector){assert.ok(q(selector),selector);q(selector).click()}
function input(selector,value,event='change'){const el=q(selector);try{el.value=String(value)}catch{}if(el.value!==String(value))Object.defineProperty(el,'value',{value:String(value),writable:true,configurable:true});el.dispatchEvent(new window.Event(event,{bubbles:true}))}
function dispatch(selector,type,props){const ev=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(ev,props);q(selector).dispatchEvent(ev)}
check('Standalone document, local source links and unique identifiers',()=>{
 assert.ok(!/<(?:script|link)[^>]+(?:src|href)=/i.test(html));
 const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);assert.equal(ids.length,new Set(ids).size);
 for(const el of document.querySelectorAll('a[href]'))if(!/^(https?:|#)/.test(el.getAttribute('href')))assert.ok(fs.existsSync(path.resolve(path.dirname(htmlPath),el.getAttribute('href'))),el.getAttribute('href'));
});
check('Minimal headings, consolidated descriptions and explicit teaching-symbol definitions',()=>{
 for(const selector of ['.kicker','.relation','.interpretation','.eyebrow','.badge','.intro'])assert.equal(q(selector),null);
 assert.equal(q('h1').textContent,'激活不留在卡上，反向怎么算？');assert.equal(q('#rc-title').textContent,'重计算：用计算，换空间');assert.equal(q('#sw-title').textContent,'Swap：用搬运，换空间');
 assert.ok(q('.recompute .desc').textContent.includes('丢弃 → 补算'));assert.ok(q('.swap .desc').textContent.includes('换出 → 取回'));
 assert.equal(q('.controls').textContent.includes('（联动）'),false);assert.ok(q('#symbols').textContent.includes('不是秒或FLOPs'));assert.ok(q('#symbols').textContent.includes('不是GB'));
});
check('Both sides default to a+m: baseline 36u, recompute 6u, swap device 6u and host 30u',()=>{
 assert.equal(evaluate('state.rc.target'),'internal');assert.equal(evaluate('state.sw.target'),'am');assert.equal(evaluate('ADV_DEFAULTS.swKinds'),'a,m');assert.equal(q('#sw-target [data-scope=am]').getAttribute('aria-pressed'),'true');
 assert.equal(evaluate('state.t'),44);assert.equal(evaluate('sample(schedules.base,44).d'),36);assert.equal(evaluate('sample(schedules.rc,44).d'),6);assert.equal(evaluate('sample(schedules.sw,44).d'),6);assert.equal(evaluate('sample(schedules.sw,44).h'),30);
 assert.equal(evaluate('schedules.rc.peak'),11);assert.equal(evaluate('schedules.sw.peak'),11);assert.equal(evaluate('schedules.sw.traffic'),60);assert.equal(evaluate('schedules.rc.work'),30);
});
check('Both swap endpoints stay allocated during D2H/H2D; device release waits for transfer',()=>{
 assert.equal(evaluate('sample(schedules.sw,5.5).d'),6);assert.equal(evaluate('sample(schedules.sw,5.5).h'),5);
 assert.equal(evaluate('sample(schedules.sw,6.7).d'),1);assert.equal(evaluate('sample(schedules.sw,6.7).h'),5);
 assert.equal(evaluate('sample(schedules.sw,46.5).d'),11);assert.equal(evaluate('sample(schedules.sw,46.5).h'),30);
 assert.equal(evaluate('sample(schedules.sw,47.5).h'),25);assert.equal(evaluate("tensorLocation(schedules.sw.records.find(r=>r.l===5&&r.k==='a'),46.5,'sw')"),'in');
});
check('Recompute drops only chosen internals, retains x, then rebuilds in backward',()=>{
 assert.equal(evaluate("tensorLocation(schedules.rc.records.find(r=>r.l===5&&r.k==='a'),44,'rc')"),'discarded');
 assert.equal(evaluate("tensorLocation(schedules.rc.records.find(r=>r.l===5&&r.k==='x'),44,'rc')"),'device');
 assert.equal(evaluate('sample(schedules.rc,47.5).d'),11);
 assert.equal(evaluate("tensorLocation(schedules.rc.records.find(r=>r.l===5&&r.k==='a'),47.5,'rc')"),'rebuilt');
});
check('No selected layers exactly reproduces baseline and zero overhead',()=>{
 click('[data-all=rc]');
 assert.equal(evaluate('JSON.stringify(schedules.rc.points)'),evaluate('JSON.stringify(schedules.base.points)'));
 assert.equal(evaluate('JSON.stringify(schedules.sw.points)'),evaluate('JSON.stringify(schedules.base.points)'));
 assert.equal(evaluate('schedules.rc.work+schedules.sw.traffic'),0);
 click('[data-all=sw]');
});
check('Layer selections synchronize from either controller or SVG while tensor scopes remain independent',()=>{
 function synced(layer,selected){for(const side of ['rc','sw'])assert.equal(q(`#${side}-layers [data-layer="${layer}"]`).getAttribute('aria-pressed'),String(selected));assert.equal(evaluate(`state.layers.has(${layer})`),selected);}
 const t=evaluate('state.t');click('#rc-layers [data-layer="2"]');synced(2,false);
 click('#rc-target [data-scope=a]');assert.equal(evaluate('schedules.rc.work'),10);
 click('#sw-target [data-scope=m]');assert.equal(evaluate('schedules.sw.traffic'),30);
 click('#rc-scene [data-layer="2"]');synced(2,true);
 click('#sw-layers [data-layer="4"]');synced(4,false);click('#sw-scene [data-layer="4"]');synced(4,true);
 click('[data-all=sw]');assert.equal(evaluate('state.layers.size'),0);assert.equal(q('#rc-layers').querySelectorAll('[aria-pressed=true]').length,0);
 click('[data-all=rc]');assert.equal(evaluate('state.layers.size'),6);assert.equal(q('#sw-layers').querySelectorAll('[aria-pressed=true]').length,6);
 assert.equal(evaluate('state.t'),t);assert.equal(evaluate('state.rc.target'),'a');assert.equal(evaluate('state.sw.target'),'m');
 click('#rc-target [data-scope=internal]');click('#sw-target [data-scope=a]');
});
check('Scope options are visible pill buttons with one selected choice per independent group',()=>{
 assert.equal(q('.scope-row select'),null);assert.equal(q('#rc-target').querySelectorAll('button').length,3);assert.equal(q('#sw-target').querySelectorAll('button').length,5);
 for(const target of ['a','m','internal']){click(`#rc-target [data-scope=${target}]`);assert.equal(q('#rc-target').querySelectorAll('[aria-pressed=true]').length,1);assert.equal(q(`#rc-target [data-scope=${target}]`).getAttribute('aria-pressed'),'true');assert.equal(evaluate('state.sw.target'),'a');}
 for(const target of ['x','m','am','all','a']){click(`#sw-target [data-scope=${target}]`);assert.equal(q('#sw-target').querySelectorAll('[aria-pressed=true]').length,1);assert.equal(evaluate('state.sw.target'),target);assert.equal(evaluate('state.rc.target'),'internal');}
});
check('Swap a+m moves only internal activations while x stays on device',()=>{
 click('#sw-target [data-scope=am]');assert.equal(evaluate('sample(schedules.sw,44).d'),6);assert.equal(evaluate('sample(schedules.sw,44).h'),30);assert.equal(evaluate('schedules.sw.traffic'),60);
 assert.equal(evaluate("tensorLocation(schedules.sw.records.find(r=>r.l===2&&r.k==='x'),44,'sw')"),'device');assert.equal(evaluate("tensorLocation(schedules.sw.records.find(r=>r.l===2&&r.k==='a'),44,'sw')"),'host');assert.equal(evaluate("tensorLocation(schedules.sw.records.find(r=>r.l===2&&r.k==='m'),44,'sw')"),'host');click('#sw-target [data-scope=a]');
});
check('Backend interpretation switches while preserving model, selections and curves',()=>{
 const before=evaluate('JSON.stringify(schedules)');click('[data-backend=Megatron]');assert.equal(evaluate('state.backend'),'Megatron');assert.ok(q('#rc-hint').textContent.includes('作用于所有层'));assert.ok(q('#sw-hint').textContent.includes('MindSpeed26.1'));assert.equal(evaluate('JSON.stringify(schedules)'),before);
 click('[data-backend=FSDPTurbo]');assert.ok(q('#sw-hint').textContent.includes('同址'));
});
check('Timeline scrub, stage jumps, chart pointer and reset all update scenes and readings',()=>{
 input('#scrub',48,'input');assert.equal(evaluate('state.t'),48);assert.ok(q('#rc-event').textContent.includes('补算'));
 click('[data-jump="97"]');assert.equal(evaluate('state.t'),97);assert.ok(q('#rc-event').textContent.includes('更新'));assert.equal(evaluate('sample(schedules.sw,state.t).d'),0);
 dispatch('#chart','pointerdown',{clientX:evaluate('(chartGeometry.left+chartGeometry.width-chartGeometry.right)/2'),pointerId:1});dispatch('#chart','pointerup',{});assert.equal(evaluate('state.t'),50);
 click('#reset');assert.equal(evaluate('state.t'),0);assert.equal(q('#time').textContent,'0%');
});
check('Playback, pause, speed, keyboard and end-of-step stop',()=>{
 click('#play');assert.equal(evaluate('state.playing'),true);input('#speed',2);frame(1000);frame(1100);assert.ok(evaluate('state.t')>0);
 click('#play');assert.equal(evaluate('state.playing'),false);const t=evaluate('state.t');frame(1200);assert.equal(evaluate('state.t'),t);
 dispatch('body','keydown',{code:'ArrowRight'});assert.equal(evaluate('state.t'),t+1);
 evaluate('state.t=99.9;state.playing=true;lastFrame=1000');frame(1100);assert.equal(evaluate('state.t'),100);assert.equal(evaluate('state.playing'),false);
 click('#play');assert.equal(evaluate('state.t'),0);assert.equal(evaluate('state.playing'),true);click('#play');
});
check('Budget resides in clock-head and moves one shared threshold without changing the memory model',()=>{
 assert.ok(q('.clock-head #budget'));assert.equal(q('.chart-footer'),null);assert.equal(q('#reading'),null);
 input('#scrub',44,'input');const before=evaluate('JSON.stringify(schedules)');input('#budget',40,'input');const y=q('#chart-budget').getAttribute('y1');input('#budget',8,'input');assert.notEqual(q('#chart-budget').getAttribute('y1'),y);assert.equal(q('#budget-value').textContent,'8u');assert.equal(evaluate('JSON.stringify(schedules)'),before);input('#budget',26,'input');
});
check('Three series share one axis and legend toggles persist independently through redraw and backend switches',()=>{
 assert.equal(q('#chart').querySelectorAll('svg').length,1);assert.equal(q('#chart').querySelectorAll('[id^=chart-series-]').length,3);assert.equal(q('#chart').querySelectorAll('#chart-clock line').length,1);
 const before=evaluate('JSON.stringify(schedules)');click('[data-curve=base]');assert.equal(q('[data-curve=base]').getAttribute('aria-pressed'),'false');assert.equal(q('#chart-series-base').style.display,'none');assert.equal(q('#legend-value-base').textContent,'—');assert.equal(q('#chart-series-rc').style.display,'inline');
 input('#budget',27,'input');click('[data-backend=Megatron]');assert.equal(q('#chart-series-base').style.display,'none');assert.equal(evaluate('JSON.stringify(schedules)'),before);
 click('[data-curve=rc]');click('[data-curve=sw]');assert.equal(evaluate('state.visible.size'),0);assert.ok(q('#chart-clock line'));input('#scrub',60,'input');assert.equal(evaluate('state.t'),60);
 for(const mode of ['base','rc','sw'])click(`[data-curve=${mode}]`);assert.equal(evaluate('state.visible.size'),3);click('[data-backend=FSDPTurbo]');input('#budget',26,'input');
});
check('Responsive chart uses actual width and keeps a shared time coordinate',()=>{
 viewport=350;window.dispatchEvent(new window.Event('resize'));assert.equal(evaluate('chartGeometry.width'),350);assert.equal(evaluate('chartGeometry.left'),36);
 dispatch('#chart','pointerdown',{clientX:189,pointerId:2});dispatch('#chart','pointerup',{});assert.equal(evaluate('state.t'),50);
 assert.ok(q('.bottom').style.getPropertyValue('--plot-left'));viewport=1000;window.dispatchEvent(new window.Event('resize'));
});
check('All 64 layer masks and every target: nonnegative residency, conserved copies, zero final activation',()=>{
 evaluate(`(() => {
 const snapshot={layers:state.layers,rc:{target:state.rc.target},sw:{target:state.sw.target}};
 for(const mode of ['rc','sw'])for(const target of (mode==='rc'?['internal','a','m']:['x','a','m','am','all']))for(let mask=0;mask<64;mask++){
  state[mode].target=target;state.layers=new Set(Array.from({length:6},(_,i)=>i).filter(i=>mask&(1<<i)));
  const s=buildSchedule(mode);for(const time of new Set(s.points.map(p=>p.t))){const p={t:time,...sample(s,time)};if(p.d<0||p.h<0)throw Error('negative memory');const expected=s.records.filter(r=>p.t>=r.born&&p.t<r.dead);if(mode==='sw'){
   const duplicated=expected.filter(r=>r.selected&&((p.t>=r.outStart&&p.t<r.outEnd)||(p.t>=r.inStart&&p.t<r.inEnd))).reduce((n,r)=>n+r.size,0);
   if(p.d+p.h!==expected.reduce((n,r)=>n+r.size,0)+duplicated)throw Error('lost or double-counted tensor');
  }}
  const end=sample(s,100);if(end.d!==0||end.h!==0)throw Error('activation leak');
 }
 state.layers=snapshot.layers;state.rc=snapshot.rc;state.sw=snapshot.sw;
 })()`);
});
function toggleFine(key,checked){q('#fine-'+key).checked=checked;q('#fine-'+key).dispatchEvent(new window.Event('change',{bubbles:true}))}
function resetFine(){click('#fine-defaults');click('#fine-apply');}
check('Drawer is closed by default; open, dismiss, Escape and shared layer presets work',()=>{
 assert.equal(q('#fine-drawer').hidden,true);click('#fine-open');assert.equal(q('#fine-drawer').hidden,false);assert.equal(q('#fine-open').getAttribute('aria-expanded'),'true');
 assert.equal(q('#fine-form').querySelectorAll('.fine-section').length,7);assert.ok(q('#fine-form').querySelectorAll('[data-adv]').length>=50);
 click('[data-layer-preset=front]');assert.equal(evaluate('state.layers.size'),3);assert.equal(q('#sw-layers').querySelectorAll('[aria-pressed=true]').length,3);click('[data-layer-preset=all]');
 dispatch('body','keydown',{code:'Escape'});assert.equal(q('#fine-drawer').hidden,true);click('#fine-open');click('#fine-shade');assert.equal(q('#fine-drawer').hidden,true);click('#fine-open');
});
check('Draft edits wait for apply; fractional groups, threshold and host-budget checks affect the planned result',()=>{
 resetFine();assert.equal(evaluate('state.sw.target'),'am');assert.equal(q('#fine-swKinds').value,'a,m');const before=evaluate('schedules.sw.traffic');input('#fine-fraction',50,'input');assert.equal(evaluate('schedules.sw.traffic'),before);click('#fine-apply');assert.equal(evaluate('schedules.sw.traffic'),30);assert.equal(q('#fine-status').textContent,'已应用');
 input('#fine-minSize',3,'input');click('#fine-apply');assert.equal(evaluate('schedules.sw.traffic'),18);resetFine();input('#fine-hostBudget',2,'input');click('#fine-apply');assert.ok(q('#fine-checks').textContent.includes('主机激活峰值'));
 resetFine();
});
check('Cache capacity and retention control eviction; saved outputs reduce replay work',()=>{
 click('#sw-target [data-scope=a]');
 input('#fine-capacity',12,'input');input('#fine-keepRate',100,'input');click('#fine-apply');assert.equal(evaluate('schedules.sw.traffic'),0);
 input('#fine-capacity',4,'input');click('#fine-apply');assert.equal(evaluate('schedules.sw.traffic'),16);
 resetFine();toggleFine('cacheA',true);click('#fine-apply');assert.equal(evaluate('schedules.rc.work'),18);assert.equal(evaluate('sample(schedules.rc,44).d'),18);
 input('#fine-cacheStore','host');click('#fine-apply');assert.equal(evaluate('schedules.rc.traffic'),24);assert.equal(evaluate('sample(schedules.rc,44).h'),12);resetFine();
});
check('Input swapping combines with recompute and replay waits for input readiness; prefetch raises residency earlier',()=>{
 toggleFine('swapInputs',true);input('#fine-h2d',3,'input');click('#fine-apply');assert.equal(evaluate('sample(schedules.rc,44).d'),0);assert.equal(evaluate('sample(schedules.rc,44).h'),6);assert.equal(evaluate('schedules.rc.traffic'),12);
 assert.equal(evaluate('schedules.rc.records.filter(r=>r.recomputed&&r.l===5).every(r=>r.restore>=49)'),true);assert.ok(q('[data-curve=rc]').textContent.includes('重算＋交换'));
 resetFine();const at46=evaluate('sample(schedules.sw,46).d');toggleFine('prefetch',true);input('#fine-prefetchAhead',2,'input');click('#fine-apply');assert.ok(evaluate('schedules.sw.records.find(r=>r.l===2&&r.k===\'a\').inStart')<70);assert.ok(evaluate('sample(schedules.sw,46).d')>at46);resetFine();
});
check('Custom save-point combinations, interface-only fields and backend-specific warnings remain distinct',()=>{
 input('#fine-swKinds','x,m','input');input('#fine-modulePattern','model.layers.{0-2}.mlp','input');click('#fine-apply');assert.equal(evaluate('state.sw.target'),'custom');assert.equal(evaluate('schedules.sw.traffic'),48);assert.ok(q('#sw-scope-label').textContent.includes('自定义'));
 const before=evaluate('JSON.stringify(schedules)');input('#fine-rank','R3');input('#fine-methodName','<unsafe>');click('#fine-apply');assert.equal(evaluate('JSON.stringify(schedules)'),before);assert.equal(q('unsafe'),null);assert.ok(q('#fine-preview').textContent.includes('<unsafe>'));
 click('[data-backend=Megatron]');input('#fine-granularity','selective');click('[data-layer-preset=front]');assert.ok(q('#fine-checks').textContent.includes('覆盖所有层'));click('[data-layer-preset=all]');click('[data-backend=FSDPTurbo]');resetFine();
});
check('Invalid combinations block apply without mutating live parameters',()=>{
 toggleFine('swapInputs',true);toggleFine('nested',true);assert.equal(q('#fine-apply').disabled,true);assert.ok(q('#fine-checks').textContent.includes('嵌套'));assert.equal(evaluate('state.advanced.swapInputs'),false);
 click('#fine-defaults');toggleFine('sharedState',true);assert.equal(q('#fine-apply').disabled,true);toggleFine('replayContext',true);assert.equal(q('#fine-apply').disabled,false);
 click('#fine-defaults');toggleFine('aliases',true);toggleFine('aliasSafe',false);assert.equal(q('#fine-apply').disabled,true);
 click('#fine-defaults');toggleFine('randomOps',true);toggleFine('saveRng',false);assert.equal(q('#fine-apply').disabled,true);
 click('#fine-defaults');toggleFine('swapInputs',true);toggleFine('repeatedBackward',true);assert.equal(q('#fine-apply').disabled,true);
 click('#fine-defaults');input('#fine-swKinds','a,a','input');assert.equal(q('#fine-apply').disabled,true);resetFine();
});
check('Advanced transfer/cache/replay combinations conserve tensors and finish without leaked activations',()=>{
 evaluate(`(() => {const saved={...state.advanced};let seed=17;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<120;i++){state.advanced={...ADV_DEFAULTS,cacheA:rnd()>.5,cacheM:rnd()>.5,cacheStore:rnd()>.5?'host':'device',swapInputs:rnd()>.5,capacity:[-1,0,4,12][Math.floor(rnd()*4)],keepRate:[0,50,100][Math.floor(rnd()*3)],fraction:[0,50,100][Math.floor(rnd()*3)],minSize:[0,2,3][Math.floor(rnd()*3)],d2h:.4+rnd()*2.6,h2d:.4+rnd()*3.1,releaseDelay:rnd()*1.5,prefetch:rnd()>.5,prefetchAhead:Math.floor(rnd()*4),maxCopies:Math.floor(rnd()*3),eviction:rnd()>.5?'fifo':'belady',replayAt:.2+rnd()*2.8};
 for(const mode of ['rc','sw']){const s=buildSchedule(mode);for(const t of new Set(s.points.map(p=>p.t))){const v=sample(s,t);if(v.d<0||v.h<0)throw Error('Negative residency');let expected=0;for(const r of s.records){if(t<r.born||t>=r.dead)continue;if(r.recomputed&&t>=r.drop&&t<r.restore)continue;expected+=r.size;if(r.outStart!==undefined&&((t>=r.outStart&&t<r.outEnd)||(t>=r.inStart&&t<r.inEnd)))expected+=r.size;}if(v.d+v.h!==expected)throw Error('Tensor conservation violated');}const end=sample(s,100);if(end.d||end.h)throw Error('Activation leak');}
 }state.advanced=saved;})()`);resetFine();click('#fine-close');
});
check('Capacity addition compares simultaneous totals; both views preserve activation-only calculations',()=>{
 assert.equal(evaluate('state.memoryView'),'total');assert.equal(evaluate('assessments.base.peak'),56);assert.equal(evaluate('assessments.rc.peak'),31);assert.equal(evaluate('assessments.sw.peak'),31);assert.equal(evaluate('assessments.rc.remaining'),7);assert.equal(evaluate('assessments.base.status'),'超容量');
 evaluate('seek(44)');assert.equal(q('#legend-value-rc').textContent,'26u');click('[data-memory-view=activation]');assert.equal(q('#legend-value-rc').textContent,'6u');assert.ok(q('#chart-budget').tagName.toLowerCase()==='path');assert.equal(evaluate('assessments.rc.peak'),31);click('[data-memory-view=total]');
 click('#fine-open');input('#fine-nonActivation',34,'input');input('#fine-safetyMargin',0,'input');click('#fine-apply');assert.equal(evaluate('assessments.rc.peak'),45);assert.equal(evaluate('assessments.sw.peak'),45);assert.equal(evaluate('assessments.rc.status'),'超容量');resetFine();
});
check('Late optimizer event can fail when activations are zero; first excess and end-exclusive release are precise',()=>{
 click('[data-cap-preset=update]');assert.equal(evaluate('state.advanced.transientEvents'),'[]');click('#fine-apply');assert.equal(evaluate('assessments.rc.first'),94);assert.equal(evaluate('assessments.rc.peak'),44);assert.equal(evaluate('assessments.rc.intervals[0].end'),99);
 click('#capacity-results [data-cap-seek="94"]');assert.equal(evaluate('state.t'),94);assert.equal(evaluate('sample(schedules.rc,94).d'),0);assert.equal(evaluate('totalMemoryAt("rc",94)'),44);assert.equal(evaluate('totalMemoryAt("rc",99)'),20);resetFine();
});
check('Temporary events overlap additively and apply to the intended candidate only',()=>{
 click('#capacity-event-add');input('[data-event-index="0"][data-event-field=name]','workspace','input');input('[data-event-index="0"][data-event-field=amount]',4,'input');
 click('#capacity-event-add');input('[data-event-index="1"][data-event-field=start]',50,'input');input('[data-event-index="1"][data-event-field=end]',65,'input');input('[data-event-index="1"][data-event-field=amount]',6,'input');input('[data-event-index="1"][data-event-field=mode]','sw');click('#fine-apply');
 assert.equal(evaluate('nonActivationAt("rc",55)'),24);assert.equal(evaluate('nonActivationAt("sw",55)'),30);assert.equal(evaluate('nonActivationAt("sw",60)'),26);assert.equal(evaluate('nonActivationAt("sw",65)'),20);
 click('[data-memory-view=activation]');assert.ok(q('#chart-budget-sw'));click('[data-memory-view=total]');
 const retained=evaluate('JSON.stringify(assessments)');click('[data-curve=sw]');assert.equal(evaluate('JSON.stringify(assessments)'),retained);click('[data-curve=sw]');
 click('[data-event-remove="1"]');click('#fine-apply');assert.equal(evaluate('nonActivationAt("sw",55)'),24);resetFine();
});
check('Safety-margin and coverage statuses are distinct; invalid capacity/events do not reach live state',()=>{
 input('#fine-deviceCapacity',32,'input');input('#fine-safetyMargin',2,'input');click('#fine-apply');assert.equal(evaluate('assessments.rc.status'),'余量不足');
 input('#fine-deviceCapacity',40,'input');input('#fine-capacityCoverage','partial');click('#fine-apply');assert.equal(evaluate('assessments.rc.status'),'信息不足');
 input('#fine-safetyMargin',40,'input');assert.equal(q('#fine-apply').disabled,true);assert.equal(evaluate('state.advanced.safetyMargin'),2);resetFine();
 click('#capacity-event-add');input('[data-event-index="0"][data-event-field=end]',20,'input');assert.equal(q('#fine-apply').disabled,true);assert.equal(evaluate('state.advanced.transientEvents'),'[]');resetFine();click('#fine-close');
});
evaluate('seek(44);rebuild()');
check('Demo/document tabs precede backend tabs; switching pauses animation and preserves configuration',()=>{
 assert.equal(document.body.dataset.page,'demo');assert.equal(q('#docs-content').hidden,true);assert.ok(q('.backend').firstElementChild.classList.contains('page-tabs'));
 const advanced=evaluate('JSON.stringify(state.advanced)'),layers=evaluate('JSON.stringify([...state.layers])'),t=evaluate('state.t');click('#play');click('#fine-open');click('#page-docs');
 assert.equal(document.body.dataset.page,'docs');assert.equal(q('#demo-content').hidden,true);assert.equal(q('#docs-content').hidden,false);assert.equal(q('#fine-drawer').hidden,true);assert.equal(evaluate('state.playing'),false);assert.equal(q('#page-docs').getAttribute('aria-selected'),'true');
 click('#page-demo');assert.equal(q('#demo-content').hidden,false);assert.equal(evaluate('state.t'),t);assert.equal(evaluate('JSON.stringify(state.advanced)'),advanced);assert.equal(evaluate('JSON.stringify([...state.layers])'),layers);assert.equal(q('h1').textContent,'激活不留在卡上，反向怎么算？');
});
check('Six FAQ questions navigate to matching answers with visible selection',()=>{
 click('#page-docs');assert.equal(q('.faq-nav').querySelectorAll('[data-faq]').length,6);assert.equal(q('.faq-body').querySelectorAll('article').length,6);
 let scrolled='';for(const article of document.querySelectorAll('.faq-section'))article.scrollIntoView=function(){scrolled=this.id};
 for(const link of document.querySelectorAll('[data-faq]')){assert.ok(q('#'+link.dataset.faq+' h2'));link.click();assert.equal(scrolled,link.dataset.faq);assert.equal(link.getAttribute('aria-current'),'true');assert.equal(q('.faq-nav').querySelectorAll('[aria-current=true]').length,1);}
 click('#page-demo');
});
check('Page tabs support keyboard navigation and maintain their focus order',()=>{
 dispatch('#page-demo','keydown',{key:'ArrowRight'});assert.equal(evaluate('pageView'),'docs');assert.equal(q('#page-demo').getAttribute('tabindex'),'-1');assert.equal(q('#page-docs').getAttribute('tabindex'),'0');
 dispatch('#page-docs','keydown',{key:'Home'});assert.equal(evaluate('pageView'),'demo');dispatch('#page-demo','keydown',{key:'End'});assert.equal(evaluate('pageView'),'docs');dispatch('#page-docs','keydown',{key:'ArrowLeft'});assert.equal(evaluate('pageView'),'demo');
});
check('FAQ inventory maps all 54 rows to current repository fields without duplicates',()=>{
 const repo='D:/Projects/FSDPTurbo';const sources=[['fsdp_turbo/memory/recompute/recompute.py','RecomputePlanConfig',3],['fsdp_turbo/memory/op_replay/op_replay.py','OpReplayScopeConfig',6],['fsdp_turbo/memory/swap/swap_manager.py','SwapPlanConfig',7],['fsdp_turbo/fsdp_turbo_config.py','SwapActivationPlanConfig',1]];
 for(const [file,name,count] of sources){const raw=fs.readFileSync(path.join(repo,file),'utf8'),body=raw.split('class '+name+':')[1].split(/\n(?=class |def |@dataclass)/)[0];assert.equal([...body.replace(/\x22\x22\x22[\s\S]*?\x22\x22\x22/g,'').matchAll(/^    (\w+):/gm)].length,count,name);}
 const mem=fs.readFileSync(path.join(repo,'fsdp_turbo/fsdp_turbo_config.py'),'utf8').split('class MemoryConfig:')[1].split(/\n(?=class |def |@dataclass)/)[0];for(const field of ['recompute','op_replay_scopes','swap_activation','swap_backend'])assert.ok(mem.includes('    '+field+':'));
 const rows=[...document.querySelectorAll('#faq-control-count [data-field-count]')];
 assert.equal(rows.length,54);assert.equal(rows.reduce((sum,r)=>sum+Number(r.dataset.fieldCount),0),54);
 const unique=new Set();
 for(const row of rows){
  const cls=row.dataset.configClass,field=row.dataset.configField;
  const raw=fs.readFileSync(path.join(repo,row.dataset.configSource),'utf8');
  const body=raw.split('class '+cls+':')[1].split(/\n(?=class |def |@dataclass)/)[0];
  assert.ok(new RegExp('^    '+field+':','m').test(body),cls+'.'+field);
  const key=row.querySelector('code').textContent;assert.ok(!unique.has(key),key);unique.add(key);
  assert.equal(row.querySelector('td').textContent,String(unique.size));
 }
 assert.deepEqual([...document.querySelectorAll('#faq-control-count table')].map(t=>t.querySelectorAll('[data-field-count]').length),[19,6,11,18]);
 assert.ok(q('#faq-controls').textContent.includes('不是全仓全部训练配置'));
});
check('Business FAQ separates current demo from target MCP experience and explains scope boundaries',()=>{
 assert.ok(q('#faq-workflow').textContent.includes('目标体验规划'));assert.ok(q('#faq-workflow').textContent.includes('尚未接通真实配置解析'));assert.ok(q('#faq-workflow').textContent.includes('最危险的rank'));assert.ok(q('#faq-workflow').textContent.includes('未建模'));
 assert.ok(q('#faq-boundary').textContent.includes('上游计算'));assert.ok(q('#faq-combination').textContent.includes('swap_inputs'));assert.ok(q('#faq-backends').textContent.includes('二选一'));
});
check('Browser location is unforgeable; drawings initialize without declaring a conflicting global',()=>{
 assert.equal(evaluate('location.href'),'file:///activation-lifecycle.html');
 assert.ok(q('#rc-scene path'));assert.ok(q('#sw-scene rect'));assert.equal(q('#chart').querySelectorAll('circle').length,3);
});
check('Timeline is viewport-fixed; reserved document space follows actual dock height',()=>{
 assert.match(html,/\.bottom\{position:fixed;[^}]*bottom:0/);
 assert.match(html,/padding-bottom:calc\(var\(--dock-height,350px\) \+ 28px\)/);
 evaluate('reserveDockSpace()');assert.equal(document.documentElement.style.getPropertyValue('--dock-height'),'236px');
 window.innerHeight=650;window.dispatchEvent(new window.Event('resize'));assert.equal(evaluate('chartGeometry.bottom'),126);
 window.innerHeight=900;window.dispatchEvent(new window.Event('resize'));assert.equal(evaluate('chartGeometry.bottom'),156);
});
if(process.argv.includes('--bake')){
 let baked=fs.readFileSync(htmlPath,'utf8');
 for(const id of ['rc-layers','sw-layers','rc-scene','sw-scene','chart','rc-event','sw-event','rc-device','sw-device','rc-work','sw-work','rc-peak','sw-peak','rc-hint','sw-hint','backend-detail','curve-legend','time']){
  const el=document.getElementById(id),tag=el.tagName.toLowerCase();
  const re=new RegExp('(<'+tag+'\\b[^>]*\\bid="'+id+'"[^>]*>)[\\s\\S]*?(</'+tag+'>)');
  const content=id==='rc-scene'?evaluate('rcScene()'):id==='sw-scene'?evaluate('swScene()'):el.innerHTML;
  assert.match(baked,re);baked=baked.replace(re,(_,open,close)=>open+content+close);
 }
 baked=baked.replace(/(id="scrub"[^>]*value=")0"/,'$144"');
 fs.writeFileSync(htmlPath,baked);
}
check('Static drawings exist before JavaScript starts',()=>{
 if(!process.argv.includes('--bake')){const {document:initial}=parseHTML(html).window;assert.ok(initial.querySelector('#rc-scene path'));assert.ok(initial.querySelector('#sw-scene rect'));assert.ok(initial.querySelector('#chart svg path'));for(const el of initial.querySelectorAll('#rc-scene rect,#rc-scene path,#rc-scene line,#sw-scene rect,#sw-scene path,#sw-scene line'))assert.equal(el.children.length,0,'SVG geometry must be a leaf');}
});
const report={file:path.basename(htmlPath),checks:checks.length,passed:checks,modelVariants:512,advancedScenarios:120,limits:'DOM and event-model verification only. Native/browser preview unavailable; no browser screenshots or responsive geometry acceptance.',browserVerified:false};
fs.writeFileSync(path.join(__dirname,'activation-lifecycle-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
