/* Canvas arrangement, viewport maximization and physical-object selection. */
(()=>{
 'use strict';
 const stage=document.querySelector('.stage'),scene=document.getElementById('scene');
 const workspace=document.createElement('div');workspace.className='scene-workspace';
 scene.before(workspace);
 workspace.append(scene,document.getElementById('twin-panel'));
 const toolbar=document.querySelector('.stage-toolbar');
 scene.prepend(toolbar);
 const maximize=document.createElement('button');maximize.id='scene-maximize';
 maximize.type='button';maximize.textContent='最大化';maximize.setAttribute('aria-pressed','false');
 maximize.setAttribute('aria-label','最大化硬件视图');
 toolbar.append(maximize);
 // Keep selection details below the floating controls when they wrap.
 new ResizeObserver(()=>scene.style.setProperty('--scene-toolbar-height',toolbar.offsetHeight+'px')).observe(toolbar);
 const canvas=document.getElementById('rank-scene');
 let drag=null,orbitFrame=0,suppressClick=false;
 const orbitEnabled=()=>state.layer==='connect'&&state.view!=='flat';
 function syncOrbit(){canvas.dataset.orbit=String(orbitEnabled());canvas.setAttribute('title',orbitEnabled()?'拖拽旋转视角 · 滚轮缩放 · 点击物件查看关联':'滚轮缩放 · 点击物件查看关联');}
 syncOrbit();
 document.addEventListener('modeling:hardware-change',syncOrbit);
 document.addEventListener('click',e=>{
  const layer=e.target.closest('[data-layer]');
  if(layer?.dataset.layer==='connect')setTab('connect');
  if(layer||e.target.closest('[data-view]'))syncOrbit();
 });
 canvas.addEventListener('pointerdown',e=>{
  if(!orbitEnabled()||e.button!==0||!e.isPrimary)return;
  suppressClick=false;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,camera:HardwareTwin.cameraFor(state.twinCamera),moved:false};
 });
 canvas.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<4)return;
  if(!drag.moved){drag.moved=true;canvas.setPointerCapture(e.pointerId);canvas.classList.add('is-rotating');}
  e.preventDefault();
  state.twinCamera=HardwareTwin.cameraFor({yaw:drag.camera.yaw-dx*.008,pitch:drag.camera.pitch+dy*.006});
  if(!orbitFrame)orbitFrame=requestAnimationFrame(()=>{orbitFrame=0;renderScene();});
 });
 function endOrbit(e){
  if(!drag||drag.id!==e.pointerId)return;
  suppressClick=drag.moved&&e.type!=='pointercancel';
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  drag=null;canvas.classList.remove('is-rotating');
 }
 canvas.addEventListener('pointerup',endOrbit);
 canvas.addEventListener('pointercancel',endOrbit);
 canvas.addEventListener('lostpointercapture',()=>{drag=null;canvas.classList.remove('is-rotating');});
 let zoomFrame=0;
 canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const unit=e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1;
  const delta=Math.max(-240,Math.min(240,e.deltaY*unit));
  state.zoom=Math.max(.55,Math.min(3,state.zoom*Math.exp(-delta*.002)));
  if(!zoomFrame)zoomFrame=requestAnimationFrame(()=>{zoomFrame=0;renderScene();});
 },{passive:false});
 document.getElementById('zoom-label').title='滚轮向上放大，向下缩小';
 document.getElementById('zoom-reset').title='恢复默认视角和缩放；互联立体图支持拖拽旋转';
 document.getElementById('zoom-reset').addEventListener('click',()=>{state.twinCamera=null;},true);
 function setMaximized(active){
  stage.classList.toggle('is-maximized',active);
  document.body.classList.toggle('hardware-maximized',active);
  maximize.textContent=active?'还原视图':'最大化';
  maximize.setAttribute('aria-pressed',String(active));
  maximize.setAttribute('aria-label',active?'还原硬件视图':'最大化硬件视图');
  window.dispatchEvent(new Event('resize'));
 }
 maximize.addEventListener('click',()=>setMaximized(!stage.classList.contains('is-maximized')));
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&stage.classList.contains('is-maximized')){setMaximized(false);maximize.focus();}
 });
 // A view change must never leave an inaccessible maximized canvas behind it.
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-mx-mode], [data-evidence-target], #nav-evidence'))setMaximized(false);
 });
 new MutationObserver(()=>{if(document.body.dataset.evidenceOpen==='true')setMaximized(false);})
  .observe(document.body,{attributes:true,attributeFilter:['data-evidence-open']});
 // Assemblies share the Rank selection toggle; drag completion never selects.
 scene.addEventListener('click',e=>{
  if(suppressClick){suppressClick=false;if(canvas.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();return;}}
  const rank=e.target.closest('[data-rank]'),assembly=e.target.closest('[data-select-tier]');
  if(rank)return;
  if(assembly){
   e.stopPropagation();chooseSceneObject(Number(assembly.dataset.selectTier),Number(assembly.dataset.selectStart));renderScene();
  }else if(e.target===canvas){clearSceneSelection();renderScene();}
 },true);
 scene.addEventListener('keydown',e=>{
  if(state.layer!=='connect')return;
  const rank=e.target.closest('[data-rank]'),assembly=e.target.closest('[data-select-tier]');
  if(assembly&&['Enter',' '].includes(e.key)){
   e.preventDefault();e.stopPropagation();
   const tier=Number(assembly.dataset.selectTier),start=Number(assembly.dataset.selectStart);
   chooseSceneObject(tier,start);renderScene();
   scene.querySelector('[data-select-tier="'+tier+'"][data-select-start="'+start+'"]')?.focus();
  }
 },true);
})();
