const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const qaRequire=createRequire(path.join(process.env.TEMP,'codex-hardware-qa','package.json'));
const {parseHTML}=qaRequire('linkedom');
const html=fs.readFileSync(path.join(__dirname,'../msModeling/硬件画像.html'),'utf8');
const {window,document}=parseHTML(html);
window.HTMLInputElement.prototype.checkValidity=()=>true;
const main=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].find(m=>m[2].includes('function communicationLayout'))[2];
const context=vm.createContext({document,window,HardwareTwin:require('../msModeling/hardware-twin.js'),Event:window.Event,URLSearchParams,location:{hash:''},setTimeout:()=>0,clearTimeout:()=>{},console});
vm.runInContext(main,context);
const read=()=>({count:document.getElementById('summary-count').textContent,rendered:document.getElementById('rank-scene').dataset.renderedCount,grid:vm.runInContext('state.profile.grid',context)});
console.log('initial',read());
document.getElementById('count-slider').value='64';
document.getElementById('count-slider').dispatchEvent(new window.Event('input',{bubbles:true}));
console.log('count input',read());
document.querySelector('[data-layer="connect"]').click();
const before=document.getElementById('rank-scene').innerHTML;
document.getElementById('grid-0-slider').value='4';
document.getElementById('grid-0-slider').dispatchEvent(new window.Event('input',{bubbles:true}));
console.log('grid input',read(),'scene changed',document.getElementById('rank-scene').innerHTML!==before);
document.getElementById('grid-0-slider').value='2';
document.getElementById('grid-0-slider').dispatchEvent(new window.Event('input',{bubbles:true}));
console.log('smaller grid',read(),document.getElementById('twin-dimensions').textContent);
assert.equal(read().count,'32die');assert.equal(read().rendered,'32');
assert.equal(vm.runInContext('state.gridRankLimit',context),64);
assert.notEqual(document.getElementById('rank-scene').innerHTML,before);
document.querySelector('[data-dims="4"]').click();
document.getElementById('grid-1-slider').value='8';
document.getElementById('grid-1-slider').dispatchEvent(new window.Event('input',{bubbles:true}));
assert.equal(read().count,'64die');assert.equal(read().rendered,'64');
assert.match(document.getElementById('twin-dimensions').textContent,/4 维/);
document.querySelector('[data-rank="63"]').dispatchEvent(new window.Event('click',{bubbles:true}));
assert.match(document.getElementById('selected-info').textContent,/R63/);
document.querySelector('[data-view="flat"]').click();
assert.equal(vm.runInContext('state.view',context),'flat');
console.log('DOM events passed: dimensions, budget, summary, scene, selection and projection');
module.exports={document,context,window,qaRequire,read};
if(process.argv.includes('--render')){
 const {Resvg}=qaRequire('@resvg/resvg-js'),twin=require('../msModeling/hardware-twin.js');
 for(const [name,options] of Object.entries({four:{grid:[2,4,4,2],count:64,selected:0,grain:'die',tier:1},three:{grid:[4,8,2],count:64,selected:17,grain:'die',tier:1}})){
  const result=twin.render(options),svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="540" viewBox="0 0 1000 540"><rect width="1000" height="540" fill="white"/>'+result.svg+'</svg>';
  fs.writeFileSync(path.join(__dirname,'twin-'+name+'.svg'),svg);
  fs.writeFileSync(path.join(__dirname,'twin-'+name+'.png'),new Resvg(svg,{font:{loadSystemFonts:true},fitTo:{mode:'zoom',value:2}}).render().asPng());
  if(name==='four'){
   const crop=svg.replace('width="1000" height="540" viewBox="0 0 1000 540"','width="1000" height="800" viewBox="300 140 250 200"');
   fs.writeFileSync(path.join(__dirname,'twin-closeup.png'),new Resvg(crop,{font:{loadSystemFonts:true}}).render().asPng());
   const phone=svg.replace('width="1000" height="540"','width="390" height="211"');
   fs.writeFileSync(path.join(__dirname,'twin-phone.png'),new Resvg(phone,{font:{loadSystemFonts:true}}).render().asPng());
  }
 }
}
