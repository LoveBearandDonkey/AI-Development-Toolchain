const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '性能采集实验台.html'), 'utf8');
const frameworkSource = html.slice(html.indexOf('const taskContext='), html.indexOf("$('task-framework').addEventListener"));
const fileSource = html.match(/^function captureFileSet[\s\S]*?(?=^function renderCaptureFiles)/m)?.[0];
const commandSource = html.match(/^function generateCommand[\s\S]*?(?=^\/\/ Parse shell words)/m)?.[0];
assert(fileSource && commandSource && frameworkSource, 'Use the actual standalone page functions');

function harness(application = 'python3 train.py') {
  const fields = new Map();
  const $ = id => {
    if (!fields.has(id)) fields.set(id, { value: '', checked: false, dataset: {} });
    return fields.get(id);
  };
  $('application').value = application;
  $('application').defaultValue = 'python3 train.py';
  const context = vm.createContext({ $, window: {}, extraSpecs: [] });
  vm.runInContext("let codeMethod='launch',launchDraft=null,editorIssue='';const state={scope:'application',mstx:false};const workflow={mode:'capture'};", context);
  vm.runInContext(frameworkSource + '\n' + commandSource + '\n' + fileSource, context);
  vm.runInContext(html.match(/^function shellQuote[^\n]*/m)[0], context);
  return { context, $, run: code => vm.runInContext(code, context) };
}

test('one task framework drives scene and framework APIs; clearing it restores CLI', () => {
  const { $, run } = harness();
  run("setTaskFramework('pytorch');codeMethod='framework'");
  assert.equal($('scene-stack').value, 'pytorch');
  assert.equal($('code-framework').value, 'pytorch');
  run("setTaskFramework('mindspore')");
  assert.equal($('code-framework').value, 'mindspore');
  assert.equal(run('codeMethod'), 'framework');
  run("setTaskFramework('unknown')");
  assert.equal(run('codeMethod'), 'launch');
  assert.equal($('scene-stack').value, 'unknown');
});

test('framework changes drop incompatible entry points and CLI marker configuration', () => {
  const { $, run } = harness();
  run("setTaskFramework('acl');codeMethod='native';state.mstx=true");
  $('scene-mstx').checked = true;
  run("setTaskFramework('pytorch')");
  assert.equal(run('codeMethod'), 'launch');
  assert.equal(run('state.mstx'), false);
  assert.equal($('scene-mstx').checked, false);
  run("codeMethod='mstx';setTaskFramework('mindspore')");
  assert.equal(run('codeMethod'), 'launch');
});

test('unspecified and other suites share one generic CLI choice', () => {
  const { run } = harness();
  run("setTaskFramework('other')");
  assert.equal(run('taskContext.value'), 'unknown');
  assert.equal(run('codeMethod'), 'launch');
  assert(!html.includes('<option value="other">'));
  for (const id of ['task-framework-note', 'app-hint', 'task-framework-source']) {
    assert(!html.includes('id="' + id + '"'), 'Deleted UI must not remain hidden in the DOM');
  }
});

test('correcting an imported framework leaves its specialized script adapter', () => {
  const { context, run } = harness();
  let cleared = false;
  context.window.launchScriptWorkbench = { active: true, clear(refresh) { assert.equal(refresh, false); cleared = true; } };
  run("setTaskFramework('mindspore')");
  assert.equal(cleared, true);
  assert.equal(run('taskContext.value'), 'mindspore');
});

test('CLI diff preserves the task and copies a complete profiling script', () => {
  const { $, run } = harness("bash '/work/my task/run.sh' --batch-size 16");
  $('application').dataset.userProvided = 'true';
  $('command').value = run("generateCommand({scope:'application',delay:10,duration:3,task:true,level:'l0',ascendcl:true,runtime:false,core:false,memory:false,aicpu:false,mstx:false,host:false},$('application').value,'./output')");
  const [file] = run("captureFileSet(state,'./output')");
  assert.equal(file.name, 'collect.sh');
  assert.equal(file.before, '# 你的原任务启动命令\n' + $('application').value);
  assert(file.content.endsWith($('command').value));
  assert(file.content.includes("--application='bash '\"'\"'/work/my task/run.sh'\"'\"' --batch-size 16'"));
  assert(!file.content.includes('以下为示例'));
  const { diff } = require('./capture-code-files.js');
  assert.equal(diff(file.before, file.content).filter(row => row.type !== 'remove').map(row => row.text).join('\n'), file.content);
});

test('example tasks are labelled; export and system commands bypass task wrapping', () => {
  const { $, run } = harness();
  $('command').value = 'msprof --output=./output';
  assert(run("captureFileSet(state,'./output')[0].content").includes('以下为示例'));
  run("workflow.mode='existing'");
  assert.equal(run("captureFileSet(state,'./output')[0].name"), 'export.sh');
  assert.equal(run("captureFileSet(state,'./output')[0].content"), $('command').value);
  run("workflow.mode='capture';state.scope='system'");
  assert.equal(run("captureFileSet(state,'./output')[0].before"), undefined);
});
