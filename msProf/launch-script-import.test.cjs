const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { inspect, build } = require('./launch-script-import.js');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('./launch-script-samples.js'), 'utf8'), context);
const options = { start: 10, end: 15, ranks: '0,1', output: "./profiling/a b'c", level: 'level1', cpu: false, memory: true, stack: false };
for (const sample of context.window.LaunchScriptSamples) {
  const info = inspect(sample.source, sample.name);
  assert.equal(info.total, sample.id === 'deepseek' ? 256 : 512);
  const result = build(info, options);
  const lines = text => text.replace(/\n$/, '').split('\n');
  assert.deepEqual(result.diff.filter(row => row.type !== 'add').map(row => row.text), lines(info.source), 'Diff retains the complete original script');
  assert.deepEqual(result.diff.filter(row => row.type !== 'remove').map(row => row.text), lines(result.script), 'Diff additions reconstruct the exact downloaded script');
  assert.equal(result.insertions.length, 2, 'Configuration and command reference are two insertion sites');
  assert.ok(build(info, { ...options, shapes: true }).flags.includes('--profile-record-shapes'), 'Shared Shape selection maps to the framework flag');
  assert.ok(result.script.startsWith(info.source.slice(0, info.start)), 'Original model and parallel configuration preserved');
  assert.ok(result.script.includes(info.command.slice(0, info.command.indexOf('--distributed-backend'))), 'Original launch arguments preserved');
  assert.match(result.script, /"\$\{MSPROF_DEMO_ARGS\[@\]\}" (?:2>&1 )?\| tee logs\//, 'Profiler arguments inserted before the original log pipeline');
  assert.ok(result.flags.includes('--profile-with-cpu'), 'Memory collection includes its CPU dependency');
  assert.ok(!result.flags.includes('--profile-with-stack'), 'Memory does not implicitly enable stacks');
  assert.match(result.script, /--profile-save-path '\.\/profiling\/a b'\\''c'/, 'Spaces and quotes in paths remain one shell argument');
  for (const invalid of [{ start: NaN }, { end: 10 }, { start: -1 }, { end: info.trainIters + 1 }, { ranks: '0,0' }, { ranks: String(info.total) }, { ranks: '$(touch unsafe)' }, { output: '' }, { output: 'bad\npath' }]) {
    assert.throws(() => build(info, { ...options, ...invalid }));
  }
  assert.throws(() => inspect(result.script, sample.name), /已有采集配置/, 'Existing profiling is not silently overwritten');
  assert.throws(() => inspect(info.source + '\n' + info.command, sample.name), /多个入口/);
  const crlf = inspect(info.source.replace(/\n/g, '\r\n'), sample.name);
  assert.equal(crlf.total, info.total);
  console.log('PASS ' + sample.id + ': preserved workload, command and logs; validated Step, Rank and paths');
}
assert.throws(() => inspect('{"train_batch_size":24}', 'config.json'), /启动命令/);
assert.throws(() => inspect('python -m torch.distributed.launch pretrain.py', 'other.sh'), /MindSpeed/);
assert.throws(() => inspect('x'.repeat(1024 * 1024 + 1), 'big.sh'), /1 MB/);
console.log('PASS unsupported / incomplete inputs remain unmodified');
