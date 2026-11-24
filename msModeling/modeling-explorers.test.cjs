const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {capacityModel,upgrade,total,bottleneck,scenarios}=require('./modeling-explorers.js');
const html=fs.readFileSync(__dirname+'/硬件画像.html','utf8');
const profiles=JSON.parse(html.match(/<script id="profile-snapshot" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const p=profiles.find(p=>p.name==='ATLAS_800_A3_752T_128G_DIE');
const load={input:2048,output:256,concurrency:32,ttft:2000,tpot:50};
test('reported boundary passes and next request exceeds at least one limit',()=>{
 for(const input of [512,2048,32768,65536])for(const count of [1,3,8,32,64]){
  const r=capacityModel(p,count,{...load,input});
  if(r.cap>0){const a=r.at(r.cap);assert.ok(a.mem<=r.unitMemory&&a.ttft<=load.ttft&&a.tpot<=load.tpot);}
  const b=r.at(r.cap+1);assert.ok(b.mem>r.unitMemory||b.ttft>load.ttft||b.tpot>load.tpot);
 }
});
test('longer context lowers capacity and consumes more KV memory',()=>{
 const a=capacityModel(p,32,load),b=capacityModel(p,32,{...load,input:32768});
 assert.ok(b.cap<a.cap);assert.ok(b.current.mem>a.current.mem);assert.ok(b.current.ttft>a.current.ttft);
});
test('each limit can be the first boundary; capacity does not pool memory across replicas',()=>{
 const a=capacityModel(p,32,load),b=capacityModel(p,32,{...load,ttft:60000,tpot:200});
 assert.equal(a.first,'时延');assert.equal(b.first,'内存');
 const small={...p,memory_size_bytes:4*2**30};assert.equal(capacityModel(small,32,load).cap,0);
});
test('invalid hardware is rejected and missing BF16 is not silently substituted',()=>{
 for(const count of [0,NaN,1.5,1e9])assert.ok(capacityModel(p,count,load).error);
 assert.ok(capacityModel({...p,mma_ops:{}},32,load).error);
});
test('upgrade obeys Amdahl limit, shifts bottleneck and has diminishing marginal returns',()=>{
 const parts=scenarios.compute.parts;
 assert.deepEqual(upgrade(parts,0,1),parts);
 assert.equal(total(upgrade(parts,0,2)),640);
 assert.equal(bottleneck(upgrade(parts,0,8)),1);
 assert.ok(total(upgrade(parts,0,2))-total(upgrade(parts,0,4))<total(parts)-total(upgrade(parts,0,2)));
 assert.equal(total(upgrade(parts,0,Infinity)),280);
 assert.deepEqual(parts,[720,160,80,40]);
});
