const assert=require('node:assert/strict');
const {diff}=require('./capture-code-files.js');

for(const [before,after]of [
  ['# 替换你的任务启动代码\npython3 train.py','export PROFILING_MODE=dynamic\n\n# 替换你的任务启动代码\npython3 train.py'],
  ['for step in range(5):\n    # 替换你的单步训练代码\n    ...','prof.start()\ntry:\n    for step in range(5):\n        # 替换你的单步训练代码\n        ...\n        prof.step()\nfinally:\n    prof.stop()'],
  ['same\nsame\ntail','same\ninserted\nsame\ntail'],
  ['removed\n',''],
  ['','added\n'],
  ['unchanged','unchanged'],
]){
  const rows=diff(before,after);
  assert.equal(rows.filter(row=>row.type!=='add').map(row=>row.text).join('\n'),before,'diff must preserve every original line');
  assert.equal(rows.filter(row=>row.type!=='remove').map(row=>row.text).join('\n'),after,'copy and download must reconstruct the modified file without diff markers');
  assert.deepEqual(rows.filter(row=>row.oldLine).map(row=>row.oldLine),before.split('\n').map((_,index)=>index+1));
  assert.deepEqual(rows.filter(row=>row.newLine).map(row=>row.newLine),after.split('\n').map((_,index)=>index+1));
}
console.log('PASS file diffs preserve original and modified content, repeated lines and line numbers');
