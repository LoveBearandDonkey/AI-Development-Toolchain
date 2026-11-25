const test=require('node:test');
const assert=require('node:assert/strict');
const {collectionWindow,rates}=require('./capture-volume.js');
const input={method:'launch',api:'pytorch',activeSteps:5,stepSeconds:2,expectedSeconds:13,windowSeconds:7,ranks:2};
const state={task:true,level:'l1',ascendcl:true,runtime:true,mstx:false,memory:false,aicpu:false,core:false,host:false,hostFreq:10,extra:{'aic-mode':'task-based','ge-api':'off','host-sys':''}};

test('each integration uses its own actual collection boundary',()=>{
  assert.equal(collectionWindow(input).duration,7);
  for(const method of ['dynamic','native'])assert.equal(collectionWindow({...input,method}).duration,13);
  for(const method of ['framework','mstx']){
    const result=collectionWindow({...input,method});assert.equal(result.duration,10);assert.equal(result.steps,5);
  }
  const marked=collectionWindow({...input,method:'mstx',api:'native'});
  assert.equal(marked.duration,7);assert.equal(marked.marked,true);assert.equal(marked.profile,'cli');
  const imported=collectionWindow({...input,imported:{valid:true,steps:4,seconds:3,duration:12,ranks:8}});
  assert.equal(imported.duration,12);assert.equal(imported.ranks,8);assert.equal(imported.profile,'imported');
});
test('missing or invalid estimates remain explicit without treating them as zero',()=>{
  for(const value of ['',0,-1,NaN,Infinity,'invalid',86401]){
    assert.equal(collectionWindow({...input,method:'framework',stepSeconds:value}).invalidField,'stepSeconds');
    assert.equal(collectionWindow({...input,method:'dynamic',expectedSeconds:value}).invalidField,'expectedSeconds');
  }
  for(const value of ['',0,1.5,65537])assert.equal(collectionWindow({...input,ranks:value}).invalidField,'ranks');
  assert.equal(collectionWindow({...input,method:'framework',activeSteps:0}).invalidField,'steps');
  assert.equal(collectionWindow({...input,method:'framework',activeSteps:6,stepSeconds:.5}).duration,3);
});
test('rates reflect generated APIs rather than copying unsupported CLI flags',()=>{
  const framework={profile:'framework',marked:false};
  const timeline=rates(state,framework);
  assert.deepEqual(timeline.map(row=>row.name),['算子时间线 L2','框架 CPU 活动']);
  assert.deepEqual(rates({...state,ascendcl:false},framework),timeline);
  assert.ok(rates({...state,memory:true},framework).some(row=>row.name==='调用栈'));
  const marked=rates({...state,mstx:true},{...framework,marked:true});
  assert.equal(marked.filter(row=>row.name==='业务打点').length,1);
  const hostState={...state,host:true,extra:{...state.extra,'host-sys':'osrt','sys-cpu-profiling':'on','sys-cpu-freq':'100'}};
  const native=rates(hostState,{profile:'native'}),cli=rates(hostState,{profile:'cli'});
  assert.ok(!native.some(row=>/Host|sys-cpu/.test(row.name)));
  assert.ok(cli.some(row=>row.name==='Host 进程 osrt'));
  const imported=rates({...state,host:true,profileStack:true,recordShapes:true},{profile:'imported'});
  assert.deepEqual(imported.map(row=>row.name),['算子时间线 L1','CPU 活动','调用栈','输入 Shape']);
});
