const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {capacityModel,balanceFullLoad}=require('./modeling-explorers.js');
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
test('full load remains feasible and the next request exceeds a boundary without relaxing targets',()=>{
 for(const count of [8,16,32,64])for(const input of [512,2048,32768,65536])for(const pinned of ['input','concurrency']){
  const requested={...load,input,concurrency:100,output:1024};
  const balanced=balanceFullLoad(p,count,requested,pinned);assert.ok(!balanced.error);
  const {load:actual,result:r}=balanced;
  assert.equal(actual.ttft,requested.ttft);assert.equal(actual.tpot,requested.tpot);
  assert.equal(actual.concurrency,r.cap);assert.ok(r.pass);
  const next=r.at(actual.concurrency+1);assert.ok(next.mem>r.unitMemory||next.ttft>actual.ttft||next.tpot>actual.tpot);
  assert.equal(actual.input%512,0);assert.ok(actual.input>=512&&actual.input<=65536);
  assert.deepEqual(requested,{...load,input,concurrency:100,output:1024});
 }
});
test('full-load concurrency and context trade off in both directions and settling is idempotent',()=>{
 const a=balanceFullLoad(p,32,{...load,concurrency:32},'concurrency');
 const b=balanceFullLoad(p,32,{...a.load,concurrency:128},'concurrency');
 assert.ok(b.load.input<a.load.input);assert.ok(b.load.concurrency>a.load.concurrency);
 const c=balanceFullLoad(p,32,{...b.load,input:a.load.input},'input');assert.ok(c.load.concurrency<b.load.concurrency);
 assert.deepEqual(balanceFullLoad(p,32,b.load,'concurrency').load,b.load);
});
test('full-load failures report no feasible solution without changing hardware or targets',()=>{
 assert.ok(balanceFullLoad({...p,memory_size_bytes:4*2**30},32,load).error);
 assert.ok(balanceFullLoad(p,0,load).error);
 assert.ok(balanceFullLoad(p,3,load).error); // TP1 cannot fit these weights plus reserve.
 const strict={...load,ttft:1,tpot:1};assert.ok(balanceFullLoad(p,32,strict).error);
 assert.equal(strict.ttft,1);assert.equal(strict.tpot,1);
});
