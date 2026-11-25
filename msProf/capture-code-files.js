(function (root) {
  'use strict';
  function diff(before, after) {
    const oldLines=before.split('\n'),newLines=after.split('\n');
    const lengths=Array.from({length:oldLines.length+1},()=>new Uint32Array(newLines.length+1));
    for(let i=oldLines.length-1;i>=0;i--)for(let j=newLines.length-1;j>=0;j--)lengths[i][j]=oldLines[i]===newLines[j]?1+lengths[i+1][j+1]:Math.max(lengths[i+1][j],lengths[i][j+1]);
    const rows=[];let i=0,j=0;
    while(i<oldLines.length||j<newLines.length){
      if(i<oldLines.length&&j<newLines.length&&oldLines[i]===newLines[j]){rows.push({type:'context',text:oldLines[i],oldLine:++i,newLine:++j});continue}
      if(i<oldLines.length&&(j===newLines.length||lengths[i+1][j]>=lengths[i][j+1]))rows.push({type:'remove',text:oldLines[i],oldLine:++i});
      else rows.push({type:'add',text:newLines[j],newLine:++j});
    }
    return rows;
  }
  function renderDiff(container, rows) {
    container.replaceChildren(...rows.map(row=>{
      const line=document.createElement('div');line.className='launch-diff-line launch-diff-'+row.type;
      for(const value of [row.oldLine??'',row.newLine??'',row.type==='add'?'+':row.type==='remove'?'−':'']){const cell=document.createElement('span');cell.className='launch-diff-gutter';cell.textContent=value;cell.setAttribute('aria-hidden','true');line.append(cell)}
      const code=document.createElement('code');code.textContent=row.text||' ';line.append(code);return line;
    }));
  }
  function mount(host) {
    const $=id=>document.getElementById(id),primary=document.querySelector('.capture-code-toolbar');
    const toolbar=document.createElement('div');toolbar.className='capture-file-toolbar';
    const tabs=document.createElement('div');tabs.id='capture-file-tabs';tabs.className='capture-file-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','本方案的文件组合');
    toolbar.append(tabs,$('code-language'),document.querySelector('.round-copy-actions'));primary.after(toolbar);
    const area=document.createElement('div');area.id='capture-file-diff';area.className='launch-diff';area.hidden=true;area.setAttribute('role','region');area.setAttribute('aria-label','接入用户代码的改动');area.tabIndex=0;$('command-surface').after(area);
    const environment=root.CaptureEnvironment.mount(host);
    const download=document.createElement('button');download.type='button';download.id='capture-file-download';download.className='copy-btn launch-icon-button';download.title='下载当前文件';download.setAttribute('aria-label','下载当前文件');download.innerHTML='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v10m-4-4 4 4 4-4M3 13v4h14v-4"/></svg>';$('copy').after(download);
    const selected=new Map();let files=[],current=null,key='',importedPath=null;
    function environmentTab(active){
      const button=document.createElement('button');button.type='button';button.className='capture-environment-tab';button.textContent='环境准备';button.dataset.captureFile='__environment__';button.setAttribute('role','tab');button.setAttribute('aria-controls','capture-environment');button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;button.addEventListener('click',()=>{selected.set(key,'__environment__');host.refresh()});return button;
    }
    function showEnvironment(context,active){
      toolbar.classList.toggle('capture-show-environment',active);environment.render(context,active);
      if(active){area.hidden=true;$('command-surface').hidden=true;$('code-settings').hidden=true;$('validation').hidden=true;const imported=$('launch-diff');if(imported)imported.hidden=true}
    }
    download.addEventListener('click',()=>{if(!current||download.disabled)return;const url=URL.createObjectURL(new Blob([current.content],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=current.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
    tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...tabs.children],index=buttons.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();tabs.children[next]?.focus()});
    function render(nextFiles,nextKey,context) {
      files=nextFiles;key=nextKey;current=files.find(file=>file.name===selected.get(key))||files[0];
      const preparation=selected.get(key)==='__environment__';
      primary.hidden=false;toolbar.hidden=false;tabs.hidden=false;download.hidden=false;download.disabled=$('copy').disabled;
      tabs.replaceChildren(environmentTab(preparation),...files.map(file=>{const button=document.createElement('button');button.type='button';button.textContent=file.name;button.dataset.captureFile=file.name;button.setAttribute('role','tab');button.setAttribute('aria-controls',file.before!==undefined?'capture-file-diff':'command-surface');button.setAttribute('aria-selected',String(!preparation&&file===current));button.tabIndex=!preparation&&file===current?0:-1;button.title=file.before!==undefined?'接入改动 · '+file.name:'启动脚本 · '+file.name;button.addEventListener('click',()=>{selected.set(key,file.name);host.refresh()});return button}));
      const patched=current.before!==undefined;area.hidden=!patched;$('command-surface').hidden=patched;
      if(patched)renderDiff(area,diff(current.before,current.content));
      $('command').value=current.content;$('manual-copy').value=current.content;$('command').readOnly=!current.editable;$('command').setAttribute('aria-label',patched?'接入改动后的 '+current.name:current.name);$('code-language').textContent=current.language;
      $('copy').title='复制当前文件';$('copy').setAttribute('aria-label','复制当前文件');
      showEnvironment(context,preparation);
      return current.content;
    }
    function renderImported(context){
      primary.hidden=true;toolbar.hidden=false;tabs.hidden=false;area.hidden=true;download.hidden=true;current=null;files=[];key='imported:'+context.name;
      const preparation=selected.get(key)==='__environment__';
      importedPath=importedPath||$('launch-file-path');
      importedPath.setAttribute('role','tab');importedPath.setAttribute('aria-controls','launch-diff');importedPath.setAttribute('aria-selected',String(!preparation));importedPath.tabIndex=preparation?-1:0;
      importedPath.onclick=()=>{selected.set(key,'__code__');host.refresh()};
      importedPath.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();importedPath.click()}};
      tabs.replaceChildren(environmentTab(preparation),importedPath);
      showEnvironment(context,preparation);
    }
    function reset(){
      selected.clear();files=[];current=null;key='';environment.reset();
      tabs.replaceChildren();area.replaceChildren();area.hidden=true;area.scrollTop=0;
      toolbar.classList.remove('capture-show-environment');
    }
    return {render,renderImported,reset,get files(){return files}};
  }
  root.CaptureCodeFiles={diff,mount};
  if(typeof module==='object'&&module.exports)module.exports={diff};
})(typeof window==='object'?window:globalThis);
