/* Anatomy Figure: a cutaway equipment rack with service drawers.
 * Model before geometry: grid coordinates determine containment and count.
 * This is an illustrative physical mapping, never a measured rack inventory.
 * Parts (per assembly, repeated as needed): floor tile, rack plinth,
 * four uprights, four connected upper ties,
 * single server deck, side wall pair, backplane, connector seats,
 * package carrier, socket, die body, die cap,
 * four memory blocks, contact strip and status aperture.
 * All decorative details are closed outlines or attached solids.
 * Groups are highlighted by rank membership; no routing paths are implied.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HardwareTwin=api})(globalThis,function(){
 'use strict';
 const names={cluster:'集群',rack:'机架',server:'服务器',package:'封装',unit:'设备单元'};
 const serverDeckHeight=3;
 const defaultCamera={yaw:Math.PI/4,pitch:Math.atan(Math.SQRT2*.4/.96)};
 function cameraFor(camera){return {yaw:Number.isFinite(camera?.yaw)?camera.yaw:defaultCamera.yaw,pitch:Math.max(Math.PI/36,Math.min(Math.PI*17/36,Number.isFinite(camera?.pitch)?camera.pitch:defaultCamera.pitch))};}
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function rolesFor(grid,grain){
  const containers=grid.length===4?['cluster','rack','server','package']:grid.length===3?['cluster','server','package']:grid.length===2?['cluster','server']:['cluster'];
  return {containers,labels:containers.map(type=>type==='package'&&grain!=='die'?'板卡托盘':names[type]),unit:grain==='die'?'die':grain==='card'?'板卡':'设备单元'};
 }
 function model({grid,count,selected=0,grain='die'}){
  const {containers,labels,unit}=rolesFor(grid,grain),strides=grid.map((_,i)=>grid.slice(i+1).reduce((a,b)=>a*b,1));
  const limit=128;let focusSize=count;
  if(count>limit){focusSize=limit;for(let i=0;i<grid.length;i++){const size=grid.slice(i).reduce((a,b)=>a*b,1);if(size<=limit){focusSize=size;break}}}
  const first=count>limit?Math.floor(selected/focusSize)*focusSize:0,last=Math.min(count,first+(count>limit?focusSize:count));
  function build(dim,start,end){
   if(dim===grid.length)return {type:'unit',tier:dim,start,end,w:22,d:22,h:5,children:[],x:0,y:0,z:0};
   const type=containers[dim],stride=strides[dim],children=[];
   const lo=Math.floor(Math.max(first,start)/stride),hi=Math.ceil(Math.min(last,end)/stride);
   for(let index=lo;index<hi;index++){const childStart=index*stride,childEnd=Math.min(end,childStart+stride);if(childEnd>first&&childStart<last)children.push(build(dim+1,childStart,childEnd));}
   const cw=Math.max(22,...children.map(c=>c.w)),cd=Math.max(22,...children.map(c=>c.d)),ch=Math.max(5,...children.map(c=>c.h));
   const stacked=type==='rack',pad=type==='package'?5:type==='server'?10:14,gap=type==='package'?4:type==='cluster'?38:10;
   // Seat packages toward the server rear; reserve a wider front strip for engraving.
   const rearPad=type==='server'?7:pad,frontPad=type==='server'?13:type==='package'?12:pad;
   const cols=type==='package'?Math.min(4,children.length):Math.min(children.length,Math.max(1,Math.ceil(Math.sqrt(children.length*cd/cw))));
   children.forEach((c,i)=>{c.x=pad+(stacked?0:i%cols*(cw+gap));c.z=(stacked?pad+20:rearPad+Math.floor(i/cols)*(cd+gap));c.y=(type==='package'?2:type==='server'?serverDeckHeight:3)+(stacked?i*(ch+16):0);});
   const w=stacked?cw+2*pad:cols*cw+Math.max(0,cols-1)*gap+2*pad;
   const d=stacked?cd+2*pad+20:Math.ceil(children.length/cols)*cd+Math.max(0,Math.ceil(children.length/cols)-1)*gap+rearPad+frontPad;
   const h=stacked?children.length*(ch+16)+10:ch+(type==='server'?12:5);
   return {type,tier:dim,start:Math.max(first,start),end:Math.min(last,end),w,d,h,children,x:0,y:0,z:0};
  }
  const tree=build(0,0,grid.reduce((a,b)=>a*b,1)),nodes=[],ranks=[];
  function locate(node,x,y,z,path){node.x+=x;node.y+=y;node.z+=z;node.path=path;nodes.push(node);if(node.type==='unit')ranks.push(node);node.children.forEach((child,i)=>locate(child,node.x,node.y,node.z,[...path,i]));}
  locate(tree,0,0,0,[]);
  return {tree,nodes,ranks,first,last,count,grid,containers,labels,unit,selected,partial:last-first<count};
 }
 function render(options){
  const m=model(options),flat=options.view==='flat',tier=Math.min(options.tier||0,m.grid.length-1);
  const camera=cameraFor(options.camera),sy=Math.sin(camera.yaw),cyaw=Math.cos(camera.yaw),sp=Math.sin(camera.pitch),cp=Math.cos(camera.pitch);
  const P=(x,y,z)=>flat?[x,z]:[(x*cyaw-z*sy)*Math.SQRT2*.82,((x*sy+z*cyaw)*sp-y*cp)*Math.hypot(Math.SQRT2*.4,.96)];
  const depth=(x,y,z)=>flat?y:(x*sy+z*cyaw)*cp+y*sp;
  const pt=v=>v.map(n=>n.toFixed(2)).join(','),poly=(vertices,fill,stroke='#bfcbd9',width=.6)=>'<polygon points="'+vertices.map(pt).join(' ')+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+width+'"/>';
  // Match the device/memory Rank view: front, right and top faces, then outline.
  const neutral=['#e4eaf2','#cdd8e5','#f9fbfe'],peerTone=['#dae6fa','#b9cce8','#f0f5ff'];
  const activeTone=['#c9dbfa','#aac4ed','#e4eeff'];
  const deepen=(face,ink,amount=.18)=>'#'+[1,3,5].map(i=>Math.round(parseInt(face.slice(i,i+2),16)*(1-amount)+parseInt(ink.slice(i,i+2),16)*amount).toString(16).padStart(2,'0')).join('');
  const capTop=deepen(peerTone[2],'#637083');
  const activeCapTop=deepen(activeTone[2],'#3975df');
  const rankTop=deepen(capTop,'#637083',.36);
  const tones={
   base:neutral,metal:neutral,board:neutral,chip:peerTone,active:activeTone,
   dark:[neutral[0],neutral[1],capTop],peerCap:[peerTone[0],peerTone[1],capTop],activeCap:[activeTone[0],activeTone[1],activeCapTop],
   rankCap:[neutral[0],neutral[1],rankTop],peerRankCap:[peerTone[0],peerTone[1],rankTop],activeRankCap:[activeTone[0],activeTone[1],deepen(activeCapTop,'#3975df',.36)]
  };
  function solid(x,y,z,w,h,d,tone='metal',stroke){const t=tones[tone],edge=stroke||(tone==='active'||tone==='activeCap'?'#3975df':tone==='chip'||tone==='peerCap'?'#a2b8db':'#bfcbd9'),A=P(x,y,z),B=P(x+w,y,z),C=P(x+w,y+h,z),D=P(x,y+h,z),E=P(x,y,z+d),F=P(x+w,y,z+d),G=P(x+w,y+h,z+d),H=P(x,y+h,z+d);return '<g data-solid="'+tone+'">'+(flat?'':poly(cyaw>=0?[E,F,G,H]:[A,B,C,D],t[0],edge)+poly(sy>=0?[B,F,G,C]:[A,E,H,D],t[1],edge))+poly([D,C,G,H],t[2],edge)+'</g>'}
  const text=(x,y,z,value,size=7,color='#6b7f99')=>{const p=P(x,y,z);return '<text x="'+p[0]+'" y="'+p[1]+'" font-size="'+size+'" font-family="Segoe UI,Microsoft YaHei,sans-serif" fill="'+color+'">'+esc(value)+'</text>'};
  function engraving(x,y,z,value,type,size=6,color='#6b7f99',center=false,maxWidth=Infinity){
   const p=P(x,y,z),u=P(x+1,y,z),v=P(x,y,z+1);
   const matrix=[u[0]-p[0],u[1]-p[1],v[0]-p[0],v[1]-p[1],...p];
   const estimated=[...value].reduce((sum,c)=>sum+(c.charCodeAt(0)>255?1:.6),0)*size;
   return '<text class="twin-engraving" data-engraving="'+type+'" transform="matrix('+matrix.join(' ')+')" x="0" y="0" text-anchor="'+(center?'middle':'start')+'" dominant-baseline="central" font-size="'+size+'" font-family="Segoe UI,Microsoft YaHei,sans-serif" fill="'+color+'"'+(estimated>maxWidth?' textLength="'+maxWidth+'" lengthAdjust="spacingAndGlyphs"':'')+'>'+esc(value)+'</text>';
  }
  const inside=n=>m.selected>=n.start&&m.selected<n.end;
  // Resolve selection against the current tree so a grid edit cannot retain stale bounds.
  const cleared=options.selectionCleared===true;
  const selection=!cleared&&options.selection&&m.nodes.find(n=>n.tier===options.selection.tier&&inside(n));
  const scope=cleared?null:m.nodes.find(n=>n.tier===tier&&inside(n));
  const related=n=>!!scope&&(n.start<scope.end&&n.end>scope.start);
  const picked=n=>!cleared&&(selection?n===selection:n.type==='unit'&&n.start===m.selected);
  const highlighted=n=>picked(n)||(related(n)&&n.tier>=tier);
  const relation=n=>cleared?'idle':picked(n)?'selected':highlighted(n)?'related':'unrelated';
  const shell=(n,ink)=>'<g class="twin-shell" data-relation="'+relation(n)+'" opacity="'+(cleared||highlighted(n)?1:.5)+'">'+ink+'</g>';
  function assembly(n){
   const {x,y,z,w,d,h,type}=n,highlight=picked(n),peer=related(n)&&n.tier>=tier,tone=highlight?'active':peer?'chip':'metal',stroke=highlight?'#3975df':peer?'#a2b8db':undefined;let back='',front='';
   if(type==='unit'){
    let ink=solid(x,y,z,w,h,d,tone,stroke);
    ink+=solid(x+2,y+h,z+2,w-4,.7,d-4,highlight?'activeRankCap':peer?'peerRankCap':'rankCap',stroke);
    ink+=engraving(x+w/2,y+h+.7,z+d/2,'R'+n.start,'rank',7,highlight?'#2159b6':'#6b7f99',true,w-6);
    return '<g class="rank-unit twin-rank" role="button" tabindex="0" data-rank="'+n.start+'" data-relation="'+relation(n)+'" opacity="'+(cleared||highlighted(n)?1:.5)+'" aria-label="选择 Rank '+n.start+'" aria-pressed="'+highlight+'"><title>R'+n.start+' · '+m.unit+'</title>'+ink+'</g>';
   }
   if(type==='cluster'){
    back+=solid(x,y,z,w,2,d,highlight?'active':peer?'chip':'base',stroke);
    back+=text(x+6,y+2.2,z+d-5,m.grid.length+'D  /  '+m.count+' '+m.unit,9);
   }else if(type==='rack'){
    back+=solid(x,y,z,w,3,d,tone,stroke);
    back+=engraving(x+7,y+3,z+d-7,'机架 '+(Math.floor(n.start/m.grid.slice(n.tier).reduce((a,b)=>a*b,1))+1),'rack',7,'#6b7f99',false,w-14);
    const parts=[],nearX=sy>=0?x+w-5:x+2,nearZ=cyaw>=0?z+d-5:z+2;
    const part=(px,py,pz,pw,ph,pd,near,tag)=>parts.push({near,depth:depth(px+pw/2,py+ph/2,pz+pd/2),ink:tag?'<g '+tag+'>'+solid(px,py,pz,pw,ph,pd,tone,stroke)+'</g>':solid(px,py,pz,pw,ph,pd,tone,stroke)});
    for(const fx of [x+2,x+w-5]){
     for(const fz of [z+2,z+d-5])part(fx,y+3,fz,3,h,3,fx===nearX||fz===nearZ);
     part(fx,y+h+3,z+5,3,3,d-10,fx===nearX,'data-rack-part="side-tie" data-rack-side="'+(fx===nearX?'near':'far')+'"');
    }
    for(const fz of [z+2,z+d-5])part(x+2,y+h+3,fz,w-4,3,3,fz===nearZ,'data-rack-part="'+(fz===z+2?'rear-tie':'front-tie')+'"');
    for(const part of parts.sort((a,b)=>a.depth-b.depth)){if(part.near)front+=part.ink;else back+=part.ink;}
   }else if(type==='server'){
    back+=solid(x,y,z,w,serverDeckHeight,d,tone,stroke);
    back+=engraving(x+6,y+serverDeckHeight,z+d-5,'服务器 '+(Math.floor(n.start/m.grid.slice(n.tier).reduce((a,b)=>a*b,1))+1),'server',6,'#6b7f99',false,w-12);
    const rear=solid(x,y+3,z,w,Math.min(9,h-3),3,tone,stroke);
    const left=solid(x,y+3,z+3,2,Math.min(9,h-3),d-3,tone,stroke),right=solid(x+w-2,y+3,z+3,2,Math.min(9,h-3),d-3,tone,stroke);
    if(cyaw>=0)back+=rear;else front+=rear;
    if(sy>=0){back+=left;front+=right;}else{back+=right;front+=left;}
   }else{
    back+=solid(x,y,z,w,1.5,d,highlight?'active':peer?'chip':'board',stroke);
    back+=solid(x+2,y+1.5,z+2,w-4,.5,d-4,highlight?'activeCap':peer?'peerCap':'dark',stroke);
    back+=engraving(x+4,y+2,z+d-7,(m.unit==='die'?'封装 ':'托盘 ')+(Math.floor(n.start/m.grid.slice(n.tier).reduce((a,b)=>a*b,1))+1),'package',5.5,'#6b7f99',false,w-8);
   }
   const centerDepth=n=>depth(n.x+n.w/2,n.y+n.h/2,n.z+n.d/2);
   const children=[...n.children].sort((a,b)=>centerDepth(a)-centerDepth(b));
   return '<g class="twin-assembly" data-assembly="'+type+'" data-group-tier="'+n.tier+'" data-rank-start="'+n.start+'" data-rank-end="'+(n.end-1)+'" data-relation="'+relation(n)+'"><title>'+m.labels[n.tier]+' · R'+n.start+'–R'+(n.end-1)+'</title><g class="twin-assembly-hit" role="button" tabindex="0" data-select-tier="'+n.tier+'" data-select-start="'+n.start+'" aria-label="选择'+m.labels[n.tier]+' R'+n.start+'–R'+(n.end-1)+'" aria-pressed="'+(n===selection)+'">'+shell(n,back)+'</g>'+children.map(assembly).join('')+'<g class="twin-assembly-hit" role="button" tabindex="-1" data-select-tier="'+n.tier+'" data-select-start="'+n.start+'" aria-label="选择'+m.labels[n.tier]+' R'+n.start+'–R'+(n.end-1)+'">'+shell(n,front)+'</g></g>';
  }
  const drawing=assembly(m.tree);
  const bounds=[];for(const n of m.nodes)for(const dx of [0,n.w])for(const dy of [-3,n.h+12])for(const dz of [0,n.d])bounds.push(P(n.x+dx,n.y+dy,n.z+dz));
  const minX=Math.min(...bounds.map(p=>p[0])),maxX=Math.max(...bounds.map(p=>p[0])),minY=Math.min(...bounds.map(p=>p[1])),maxY=Math.max(...bounds.map(p=>p[1]));
  const scale=Math.min(850/(maxX-minX+35),390/(maxY-minY+35))*(options.zoom||1),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  const svg='<g class="twin-model" transform="translate(500 265) scale('+scale+') translate('+(-cx)+' '+(-cy)+')">'+drawing+'</g>';
  return {...m,svg,tier,scope,selection,camera};
 }
 return {model,render,rolesFor,names,defaultCamera,cameraFor};
});
