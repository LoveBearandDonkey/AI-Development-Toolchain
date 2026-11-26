const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/硬件画像.html','utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const snapshot=scripts.find(m=>m[1].includes('profile-snapshot'))[2];
const main=scripts.find(m=>m[2].includes('function communicationLayout'))[2];
function harness(){
 const elements=new Map();
 const canvas={width:0,height:0,toDataURL:()=> 'data:image/png;base64,test',getContext:()=>new Proxy({},{get:()=>()=>{}})};
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',max:'',dataset:{},textContent:id==='profile-snapshot'?snapshot:'',innerHTML:'',addEventListener:()=>{},setAttribute:()=>{},closest:()=>({querySelector:()=>({lastElementChild:element(id+'-note')})})});return elements.get(id)};
 const sandbox=vm.createContext({HardwareTwin:require('./hardware-twin.js'),document:{getElementById:element,createElement:()=>canvas,querySelectorAll:()=>[],dispatchEvent:()=>{}},Event:class {},console});
 vm.runInContext(main.slice(0,main.indexOf("document.querySelector('.config-tabs')")),sandbox);
 const run=code=>vm.runInContext(code,sandbox);
 run("state.profile=clone(PROFILES.find(p=>p.name===state.base))");
 return {run,element};
}
test('all inline application scripts parse',()=>{
 for(const [,attrs,code] of scripts)if(!attrs.includes('application/json'))new vm.Script(code);
});

test('click selection toggles by object identity in cube and cabinet views',()=>{
 const {run,element}=harness();
 for(const layer of ['device','memory','connect']){
  run(`state.layer='${layer}'; chooseSceneObject(state.profile.grid.length,17,false); renderScene()`);
  assert.equal(run('state.selectionCleared'),false);
  assert.match(element('selected-info').innerHTML,/R17/);
  run('chooseSceneObject(state.profile.grid.length,17); renderScene()');
  assert.equal(run('state.selectionCleared'),true);
  assert.ok(!/aria-pressed="true"/.test(element('rank-scene').innerHTML));
  run('chooseSceneObject(state.profile.grid.length,17); renderScene()');
  assert.equal(run('state.selectionCleared'),false);
 }
 run("state.layer='connect'; chooseSceneObject(1,16,false); chooseSceneObject(2,16)");
 assert.equal(run('state.selectionCleared'),false,'Another object with the same first Rank must select');
 run('chooseSceneObject(2,16)');
 assert.equal(run('state.selectionCleared'),true);
 run('chooseSceneObject(state.profile.grid.length,16,false)');
 assert.equal(run('state.selectionCleared'),false,'Keyboard navigation must reselect');
});
test('slider maxima are derived from the rank budget divided by all other dimensions',()=>{
 const {run,element}=harness();
 run('state.profile.grid=[2,8,2]; state.count=32; syncGridLimits()');
 assert.equal(element('grid-1-slider').max,8);
 run('state.count=8; syncGridLimits()');
 assert.equal(element('grid-1-slider').max,2);
 run('state.profile.grid=[1024,32,2]; state.count=65536; syncGridLimits()');
 assert.equal(element('grid-2-slider').max,2);
 run('state.count=1; syncGridLimits()');
 assert.equal(element('grid-0-slider').disabled,true);
 assert.equal(element('grid-0-slider').max,2);
 run('state.count=NaN; syncGridLimits()');
 assert.equal(element('grid-0-slider').disabled,true);
});
test('oversized grids normalize on edit; subsequent edits change rank count without exceeding budget',()=>{
 const {run,element}=harness();
 run('state.count=64; state.profile.grid=[48,32,20,2]; applyGridDimension(0,48)');
 assert.equal(run('capacity()'),64);
 assert.ok(run('state.profile.grid[0]')<=8);
 for(let i=0;i<4;i++)for(let value=2;value<=64;value++){
  run(`applyGridDimension(${i},${value})`);
  assert.ok(run('capacity()')<=64);
  assert.equal(run('state.count'),run('capacity()'));
  assert.equal(run('state.gridRankLimit'),64);
  assert.equal(run('state.profile.grid.length'),4);
  for(let j=0;j<4;j++)assert.equal(element('grid-'+j).value,run(`state.profile.grid[${j}]`));
 }
});
test('infeasible dimensions are rejected, odd counts factor correctly and changing rank count rebalances',()=>{
 const {run}=harness();
 run('state.count=3');
 assert.equal(run('rankGridShape(2)'),null);
 assert.deepEqual(Array.from(run('rankGridShape(1)')),[3]);
 run('state.count=6');
 assert.equal(run('rankGridShape(2).reduce((a,b)=>a*b,1)'),6);
 run('state.count=65536');
 assert.equal(run('rankGridShape(1)'),null);
 assert.equal(run('rankGridShape(4).reduce((a,b)=>a*b,1)'),65536);
 run('state.count=64; setRankGrid(rankGridShape(4)); setCount(32)');
 assert.equal(run('capacity()'),32);
 run('setCount(3)');
 assert.deepEqual(Array.from(run('state.profile.grid')),[3]);
 run('setCount(1)');
 assert.deepEqual(Array.from(run('state.profile.grid')),[2]);
 run('setCount(65536); setCount(1031)');
 assert.equal(run("errors.some(message=>message.includes('无法分解'))"),true);
});
test('viewing a built-in profile preserves hardware capacity until the topology is edited',()=>{
 const {run}=harness();
 const before=run('JSON.stringify(state.profile.grid)');
 run('syncGridLimits(); setCount(64)');
 assert.equal(run('JSON.stringify(state.profile.grid)'),before);
 run('applyGridDimension(0,4)');
 assert.ok(run('capacity()')<=64);
 assert.equal(run('state.gridFollowsRanks'),true);
});
test('an upper rank budget need not be fully occupied or factor exactly into every dimension',()=>{
 const {run}=harness();
 run('state.count=17; state.gridRankLimit=17; state.profile.grid=[2,2,2,2]');
 assert.equal(run('boundedRankGrid(4).reduce((a,b)=>a*b,1)'),16);
 run('applyGridDimension(0,3); refreshHardware()');
 assert.equal(run('state.count'),16);assert.equal(run('state.gridRankLimit'),17);
 assert.equal(run('errors.length'),0);
});
test('one to four dimensions group every active rank once, including partial grids',()=>{
 const {run}=harness();
 for(const [grid,count] of [[[32],32],[[4,8],32],[[2,8,2],32],[[2,2,4,2],32],[[1024,8,2],19]]){
  const layout=run(`communicationLayout(${JSON.stringify(grid)},${count})`);
  assert.deepEqual(Array.from(layout.positions,p=>p.rank),Array.from({length:count},(_,i)=>i));
  assert.equal(new Set(layout.positions.map(p=>`${p.x},${p.z}`)).size,count);
  for(let tier=0;tier<grid.length;tier++){
   const groups=layout.frames.filter(f=>f.tier===tier),size=grid.slice(tier).reduce((a,b)=>a*b,1);
   assert.equal(groups.length,Math.ceil(count/size));
   for(const group of groups)for(const p of layout.positions.filter(p=>p.rank>=group.start&&p.rank<=group.end)){
    assert.ok(p.x>=group.x&&p.z>=group.z&&p.x+1<=group.x+group.w+1e-8&&p.z+1<=group.z+group.d+1e-8);
   }
  }
 }
 const a=run('communicationLayout([2,8,2],32).positions'),b=run('communicationLayout([2,2,4,2],32).positions');
 assert.notDeepEqual(JSON.stringify(a),JSON.stringify(b));
});
test('connection renderer uses physical assemblies, highlights tiers and follows the selected rank in large grids',()=>{
 const {run,element}=harness();
 run('state.profile.grid=[2,8,2]; state.count=32; state.layer="device"; renderScene()');
 const device=element('rank-scene').innerHTML;
 run('state.layer="connect"; renderScene()');
 assert.notEqual(element('rank-scene').innerHTML,device);
 assert.match(element('rank-scene').innerHTML,/data-assembly="server"/);
 assert.match(element('rank-scene').innerHTML,/data-assembly="package"/);
 assert.equal(element('rank-scene').dataset.renderedCount,'32');
 run('state.tier=1; state.selected=17; state.view="flat"; renderScene()');
 assert.match(element('selected-info').innerHTML,/R17/);
 assert.match(element('selected-info').innerHTML,/互连层 1/);
 run('state.profile.grid=[16,16,16]; state.count=4096; renderScene()');
 assert.equal(element('rank-scene').dataset.totalCount,'4096');
 assert.ok(Number(element('rank-scene').dataset.renderedCount)<=128);
 assert.match(element('page-label').textContent,/局部/);
});
