const {test}=require('node:test'),assert=require('node:assert/strict');
const twin=require('./hardware-twin.js');
test('one to four dimensional models preserve every rank and contain their components',()=>{
 for(const grid of [[64],[8,8],[4,8,2],[2,4,4,2]]){
  const m=twin.model({grid,count:64,selected:17,grain:'die'});
  assert.deepEqual(m.ranks.map(r=>r.start),Array.from({length:64},(_,i)=>i));
  for(const n of m.nodes)for(const c of n.children){
   assert.ok(c.x>=n.x&&c.z>=n.z&&c.y>=n.y);
   assert.ok(c.x+c.w<=n.x+n.w+1e-8&&c.z+c.d<=n.z+n.d+1e-8&&c.y+c.h<=n.y+n.h+1e-8);
  }
 }
});
test('four dimensions map to two racks, eight servers, 32 packages and 64 dies',()=>{
 const m=twin.model({grid:[2,4,4,2],count:64,grain:'die'});
 for(const [type,count] of Object.entries({rack:2,server:8,package:32,unit:64}))assert.equal(m.nodes.filter(n=>n.type===type).length,count);
});

test('packages remain seated on server decks with rear placement and room for front labels',()=>{
 for(const grid of [[4,8,2],[2,4,4,2]]){
  const m=twin.model({grid,count:64,grain:'die'});
  for(const server of m.nodes.filter(n=>n.type==='server'))for(const child of server.children){
   assert.equal(child.y,server.y+3,'Package underside must meet the server deck top');
  }
  for(const server of m.nodes.filter(n=>n.type==='server')){
   assert.equal(Math.min(...server.children.map(c=>c.z))-server.z,7);
   assert.equal(server.z+server.d-Math.max(...server.children.map(c=>c.z+c.d)),13);
  }
  for(const pack of m.nodes.filter(n=>n.type==='package')){
   assert.equal(pack.z+pack.d-Math.max(...pack.children.map(c=>c.z+c.d)),12);
  }
 }
});

test('near rack top ties paint above servers from each viewing direction',()=>{
 for(const view of ['iso','flat'])for(const yaw of [Math.PI/4,Math.PI*3/4,Math.PI*5/4,Math.PI*7/4]){
  const {svg}=twin.render({grid:[2,4,4,2],count:64,grain:'die',view,camera:{yaw}});
  const racks=svg.split('data-assembly="rack"').slice(1);
  assert.equal(racks.length,2);
  for(const rack of racks){
   assert.ok(rack.indexOf('data-rack-side="far"')<rack.indexOf('data-assembly="server"'));
   assert.ok(rack.indexOf('data-rack-side="near"')>rack.lastIndexOf('data-assembly="server"'));
  }
 }
});

test('orbit covers every side while preserving ranks, selection and finite geometry',()=>{
 const options={grid:[2,4,4,2],count:64,selected:17,selection:{tier:4}};
 const initial=twin.render(options);
 const projections=new Set();
 for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*3/2,Math.PI*2])for(const pitch of [0,.5,Math.PI/2]){
  const rotated=twin.render({...options,camera:{yaw,pitch}});
  assert.equal(rotated.ranks.length,64);
  assert.equal(rotated.selection.start,17);
  assert.ok(rotated.camera.pitch>0&&rotated.camera.pitch<Math.PI/2);
  assert.ok(!/NaN|Infinity|undefined/.test(rotated.svg));
  assert.equal((rotated.svg.match(/class="rank-unit twin-rank"/g)||[]).length,64);
  projections.add(rotated.svg);
 }
 assert.ok(projections.size>=12);
 assert.equal(twin.render({...options,camera:twin.defaultCamera}).svg,initial.svg);
 const flat=twin.render({...options,view:'flat'});
 assert.notEqual(flat.svg,initial.svg);
});
test('changing a dimension changes the modeled population, layout and group scope',()=>{
 const a=twin.render({grid:[4,8,2],count:64,selected:17,tier:2}),b=twin.render({grid:[2,8,2],count:32,selected:17,tier:1});
 assert.equal(a.ranks.length,64);assert.equal(b.ranks.length,32);assert.notEqual(a.svg,b.svg);
 assert.equal(a.scope.end-a.scope.start,2);assert.equal(b.scope.end-b.scope.start,16);
 assert.ok(!/twin-relation|twin-network|<path|<circle/.test(b.svg));
});
test('large populations disclose a bounded focus and always include the selected rank',()=>{
 for(const [grid,count] of [[[256,256],65536],[[16,16,16],4096],[[2,4,4,2],59]])for(const selected of [0,Math.floor(count/2),count-1]){
  const m=twin.render({grid,count,selected,grain:'die'});
  assert.ok(m.ranks.length<=128);assert.ok(m.ranks.some(r=>r.start===selected));
  assert.equal(m.ranks.length,m.last-m.first);assert.equal(m.partial,count>128);
  assert.ok(!/NaN|Infinity|undefined/.test(m.svg));
 }
});

test('cleared selection restores neutral opacity and retains the large-scene focus',()=>{
 const options={grid:[16,16,16],count:4096,selected:2049,tier:2,selection:{tier:3}};
 const active=twin.render(options),cleared=twin.render({...options,selectionCleared:true});
 assert.equal(cleared.first,active.first);
 assert.equal(cleared.last,active.last);
 assert.equal(cleared.scope,null);
 assert.ok(!/aria-pressed="true"|data-relation="selected"|data-relation="related"|opacity="0.5"/.test(cleared.svg));
});

test('only selected and same-group elements are opaque, without compounding container opacity',()=>{
 const options={grid:[2,4,4,2],count:64,selected:17,grain:'die',tier:3};
 const rank=twin.render({...options,selection:{tier:4}});
 assert.equal(rank.selection.type,'unit');
 const units=[...rank.svg.matchAll(/<g class="rank-unit twin-rank"[^>]*>/g)].map(m=>m[0]);
 assert.equal(units.filter(tag=>tag.includes('opacity="0.5"')).length,62);
 assert.equal(units.filter(tag=>tag.includes('data-relation="selected"')).length,1);
 const assemblies=[...rank.svg.matchAll(/<g class="twin-assembly"[^>]*>/g)];
 assert.ok(assemblies.every(m=>!m[0].includes('opacity=')),'Container opacity must not multiply into descendants');
 assert.equal((rank.svg.match(/<g class="twin-assembly"[^>]*data-relation="related"/g)||[]).length,1);
 const server=twin.render({...options,tier:2,selection:{tier:2}});
 assert.equal(server.selection.type,'server');
 const descendants=[...server.svg.matchAll(/<g class="rank-unit twin-rank"[^>]*>/g)].map(m=>m[0]);
 assert.equal(descendants.filter(tag=>tag.includes('data-relation="related"')&&tag.includes('opacity="1"')).length,8);
 assert.equal(descendants.filter(tag=>tag.includes('opacity="0.5"')).length,56);
 assert.ok(!/twin-relation|twin-network|<path|<circle/.test(server.svg));
 const cluster=twin.render({...options,tier:0,selection:{tier:0}});
 assert.ok(!cluster.svg.includes('opacity="0.5"'));
 for(const [tier,full] of [[0,64],[1,32],[2,8],[3,2]]){
  const group=twin.render({...options,tier});
  const members=[...group.svg.matchAll(/<g class="rank-unit twin-rank"[^>]*>/g)].map(m=>m[0]);
  assert.equal(members.filter(tag=>tag.includes('opacity="1"')).length,full);
  assert.equal(members.filter(tag=>tag.includes('opacity="0.5"')).length,64-full);
  assert.ok(!/twin-relation|twin-network|<path|<circle/.test(group.svg));
 }
});
