const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluatePair}=require('./modeling-actions.js');
const before={run:'run-before',values:{qps:2.6,ttft:1050,tpot:44,memory:47}};
const after={run:'run-after',values:{qps:3,ttft:900,tpot:40,memory:50}};
const targets={qps:2,ttft:1500,tpot:55,memory:128};
test('paired real inputs produce metric changes, target checks and explicit regressions',()=>{
 const r=evaluatePair(before,after,targets,64,true,'commit-001');
 assert.deepEqual(r.issues,[]);assert.ok(r.improved);assert.ok(r.allPassed);assert.deepEqual(r.regressions,[]);
 assert.equal(r.memoryLimit,64);assert.ok(Math.abs(r.changes.qps-15.3846153846)<1e-8);
 const mixed=evaluatePair(before,{...after,values:{...after.values,ttft:1100}},targets,64,true,'commit-001');
 assert.deepEqual(mixed.regressions,['ttft']);assert.ok(mixed.improved);
});
test('blank, nonfinite, duplicate records and unconfirmed comparisons never become a result',()=>{
 for(const bad of ['',0,-1,'Infinity','NaN']){
  const r=evaluatePair(before,{...after,values:{...after.values,qps:bad}},targets,64,true,'commit-001');
  assert.ok(r.issues.length);assert.equal(r.changes,undefined);
 }
 assert.ok(evaluatePair(before,{...after,run:before.run},targets,64,true,'change').issues.length);
 assert.ok(evaluatePair(before,after,targets,64,false,'change').issues.length);
 assert.ok(evaluatePair(before,after,targets,64,true,'').issues.length);
});
test('faster performance can still fail capacity or business goals',()=>{
 const r=evaluatePair(before,after,targets,48,true,'change');
 assert.ok(r.improved);assert.equal(r.allPassed,false);assert.equal(r.passes.memory,false);
 const noChange=evaluatePair(before,{...before,run:'run-after'},targets,64,true,'change');
 assert.equal(noChange.improved,false);assert.deepEqual(noChange.regressions,[]);
});
