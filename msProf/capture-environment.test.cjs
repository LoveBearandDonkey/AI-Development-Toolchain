const test=require('node:test');
const assert=require('node:assert/strict');
const {requirements,report}=require('./capture-environment.js');
const ids=context=>requirements(context).map(row=>row.id);
test('requirements follow the selected integration without installing every framework',()=>{
  assert.deepEqual(ids({method:'launch'}),['device','cann','msprof','output']);
  assert.ok(ids({method:'dynamic'}).includes('dynamic'));
  assert.ok(!ids({method:'dynamic'}).includes('framework'));
  const mindspore=requirements({method:'framework',framework:'mindspore'});
  assert.ok(mindspore.find(row=>row.id==='framework').name.includes('MindSpore'));
  assert.ok(!mindspore.some(row=>row.name.includes('torch_npu')));
  assert.ok(ids({method:'mstx',api:'native'}).includes('sdk'));
  assert.ok(!ids({method:'mstx',api:'native'}).includes('python'));
  assert.ok(ids({method:'mstx',api:'pytorch'}).includes('mstx'));
  assert.ok(ids({method:'framework',framework:'pytorch',imported:true}).includes('mindspeed'));
});
test('demo outcomes identify actionable missing or unsupported requirements',()=>{
  for(const context of [{method:'launch'},{method:'dynamic'},{method:'framework',framework:'pytorch'},{method:'framework',framework:'mindspore'},{method:'native'},{method:'mstx',api:'native'},{method:'mstx',api:'pytorch'},{method:'framework',imported:true}]){
    for(const scenario of ['missing','incompatible']){
      const issues=report(context,scenario).filter(row=>row.status!=='pass');
      assert.equal(issues.length,1);assert.ok(issues[0].href||issues[0].fix);
    }
    assert.ok(report(context,'ready').every(row=>row.status==='pass'));
  }
});
