(function(root){
  'use strict';
  // Illustrative rates for configuration comparisons; not measured framework benchmarks.
  const model={baseMB:8,l0MBps:8,l1MBps:18,l2MBps:25,ascendclMBps:3,runtimeMBps:7,mstxMBps:1.5,memoryMBps:11,aicpuMBps:5,taskPmuMBps:26,samplePmuMBperHz:.12,textExpansion:1.6,dbExpansion:.5};
  const positive=(value,max=86400)=>value!==''&&value!=null&&Number.isFinite(Number(value))&&Number(value)>=.01&&Number(value)<=max;
  function collectionWindow(input){
    if(input.imported)return {...input.imported,profile:'imported',kind:'steps',marked:false,invalidField:input.imported.valid?'':'imported',reason:'请修正采集区间、Rank 或每步耗时'};
    const python=input.method==='framework'||input.method==='mstx'&&input.api==='pytorch';
    const result={ranks:Number(input.ranks),profile:python?'framework':input.method==='native'?'native':'cli',marked:input.method==='mstx',kind:python?'steps':['dynamic','native'].includes(input.method)?input.method:'window',valid:true};
    if(!Number.isInteger(result.ranks)||result.ranks<1||result.ranks>65536)return {...result,valid:false,invalidField:'ranks',reason:'请填写 1–65536 的整数 Rank 数'};
    if(python){
      result.steps=Number(input.activeSteps);
      if(!Number.isInteger(result.steps)||result.steps<1||result.steps>1000)return {...result,valid:false,invalidField:'steps',reason:'请填写 1–1000 的整数采集 Step 数'};
      if(!positive(input.stepSeconds))return {...result,valid:false,invalidField:'stepSeconds',reason:'请补充预计每步耗时（0.01–86400 秒）'};
      result.seconds=Number(input.stepSeconds);result.duration=result.steps*result.seconds;
    }else{
      const expected=['dynamic','native'].includes(input.method),value=expected?input.expectedSeconds:input.windowSeconds;
      if(!positive(value,expected?86400:4294967295))return {...result,valid:false,invalidField:expected?'expectedSeconds':'window',reason:expected?'请补充预计采集时长（0.01–86400 秒）':'请配置有效的采集时间窗口'};
      result.duration=Number(value);
    }
    return result;
  }
  function rates(state,context,labels={}){
    const w=model,items=[],add=(name,rate)=>items.push({name,rate}),framework=context.profile==='framework',imported=context.profile==='imported',native=context.profile==='native';
    const level=framework&&state.runtime?'l2':state.level;
    if(state.task)add('算子时间线 '+level.toUpperCase(),level==='l0'?w.l0MBps:level==='l2'?w.l2MBps:w.l1MBps);
    if(framework){
      // The template always requests CPU/NPU activities; Runtime selects Level2.
      add('框架 CPU 活动',2);
      if(state.memory){add('框架内存',w.memoryMBps);add('调用栈',12)}
      if(state.mstx||context.marked)add('业务打点',w.mstxMBps);
      if(state.core)add('AI Core 硬件指标',w.taskPmuMBps);
      if(state.host)add('Host 系统活动',.3);
      return items;
    }
    for(const [key,name]of [['ascendcl','AscendCL 接口'],['runtime','Runtime 接口'],['mstx','业务打点'],['memory',imported?'框架内存':'算子内存'],['aicpu','AI CPU 明细']])if((state[key]||key==='mstx'&&context.marked)&&(!imported||key==='memory'))add(name,w[key+'MBps']);
    if(state.core&&!imported)add('AI Core 硬件指标',!native&&state.extra['aic-mode']==='sample-based'?w.samplePmuMBperHz*Number(state.extra['aic-freq']):w.taskPmuMBps);
    if(state.host&&!native)add(imported?'CPU 活动':'Host CPU / 内存',imported?2:(.3+.035*state.hostFreq)*(state.extra['host-sys-usage']==='cpu,mem'?1:.6));
    if(imported){if(state.profileStack)add('调用栈',12);if(state.recordShapes)add('输入 Shape',4)}
    if(!imported&&!native){
      for(const [parent,freq,weight]of [['sys-hardware-mem','sys-hardware-mem-freq',.02],['sys-cpu-profiling','sys-cpu-freq',.03],['sys-profiling','sys-sampling-freq',.012],['sys-pid-profiling','sys-pid-sampling-freq',.02],['sys-io-profiling','sys-io-sampling-freq',.025],['sys-interconnection-profiling','sys-interconnection-freq',.025],['dvpp-profiling','dvpp-freq',.03]])if(state.extra[parent]==='on')add(labels[parent]||parent,Number(state.extra[freq])*weight);
      if(state.extra['ge-api']!=='off')add('GE 动态 Shape',state.extra['ge-api']==='l1'?1.4:.7);
      if(state.extra.l2==='on')add('独立 L2 / TLB',.5);
      if(state.extra['host-sys'])for(const item of state.extra['host-sys'].split(','))add('Host 进程 '+item,item==='osrt'?8:1);
    }
    return items;
  }
  root.CaptureVolume={model,collectionWindow,rates};
  if(typeof module==='object'&&module.exports)module.exports={model,collectionWindow,rates};
})(typeof window==='object'?window:globalThis);
