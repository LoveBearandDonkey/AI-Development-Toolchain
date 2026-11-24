/* Read-only shell inspection for the launch-script demo. Never executes shell input. */
(function (root) {
  'use strict';
  function inspect(text, name) {
    if (text.length > 1024 * 1024 || text.includes('\0')) throw Error('请选择小于 1 MB 的文本启动脚本。');
    const source = text.replace(/\r\n?/g, '\n');
    const vars = {};
    for (const line of source.split('\n')) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=(?:"([^"\n]*)"|'([^'\n]*)'|([^\s#]+))/);
      if (match) vars[match[1]] = match[2] ?? match[3] ?? match[4];
    }
    const number = key => /^\d+$/.test(vars[key] || '') ? Number(vars[key]) : null;
    const launch = /^[ \t]*(?:python(?:3)?\s+-m\s+torch\.distributed\.(?:launch|run)|torchrun)\b[^\n]*/gm;
    const launches = [...source.matchAll(launch)];
    if (launches.length !== 1) throw Error('需要一条明确的 torchrun / torch.distributed 启动命令；当前文件不是完整启动脚本，或包含多个入口。');
    if (!/mindspeed_llm\.|MindSpeed/i.test(source)) throw Error('这轮 Demo 支持 MindSpeed 启动脚本。其他框架请继续使用通用配置。');
    const start = launches[0].index;
    let end = start;
    do {
      const next = source.indexOf('\n', end);
      end = next < 0 ? source.length : next + 1;
      if (!/\\\s*$/.test(source.slice(start, end).trimEnd())) break;
    } while (end < source.length);
    const command = source.slice(start, end).trimEnd();
    const entry = command.match(/\b(pretrain[\w.-]*\.py)\b/)?.[1];
    if (!entry) throw Error('未找到可识别的训练入口。请使用带 pretrain*.py 入口的 MindSpeed 脚本。');
    const profileSource = source.replace(/^\s*#.*$/gm, '');
    if (/--profile(?:\s|=|-[a-z])|\bMSPROF_DEMO_ARGS\b/.test(profileSource)) throw Error('脚本已有采集配置。为避免覆盖原设置，请先使用未添加采集参数的脚本演示。');
    const perNode = number('NPUS_PER_NODE'), nodes = number('NNODES');
    const total = perNode && nodes ? perNode * nodes : null;
    const trainIters = source.match(/--train-iters\s+(\d+)/)?.[1];
    const placeholders = Object.entries(vars).filter(([, value]) => /your .*path/i.test(value)).map(([key]) => key);
    const model = /deepseek4/i.test(entry + name) ? 'DeepSeek-V4-Flash' : /glm5/i.test(name) ? 'GLM-5' : entry.replace('.py', '');
    return { source, name, vars, start, end, command, entry, model, nodes, perNode, total,
      tp: number('TP'), pp: number('PP'), ep: number('EP'), cp: number('CP'),
      trainIters: trainIters ? Number(trainIters) : null, placeholders };
  }
  const quote = text => "'" + text.replace(/'/g, "'\\''") + "'";
  function build(info, options) {
    const { start, end, ranks, output, level, cpu, memory, stack, shapes } = options;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > 10000000) throw Error('结束 Step 必须大于开始 Step，范围为 0–10,000,000。');
    if (info.trainIters && end > info.trainIters) throw Error('结束 Step 超过脚本中的训练步数 ' + info.trainIters + '。');
    const rankList = ranks.trim().split(/[\s,]+/);
    if (!ranks.trim() || !rankList.every(value => /^\d+$/.test(value)) || new Set(rankList.map(Number)).size !== rankList.length) throw Error('请填写不重复的全局 Rank 编号，例如 0 或 0,1。');
    if (rankList.some(value => !Number.isSafeInteger(Number(value)) || Number(value) >= (info.total || 65536))) throw Error('Rank 编号需在 0–' + ((info.total || 65536) - 1) + ' 之间。');
    if (!output.trim() || /[\x00-\x1f\x7f]/.test(output)) throw Error('请填写有效的采集保存目录。');
    if (!['level0', 'level1', 'level2'].includes(level)) throw Error('请选择采集详细程度。');
    const flags = ['--profile', '--profile-step-start ' + start, '--profile-step-end ' + end,
      '--profile-ranks ' + rankList.map(Number).join(' '), '--profile-level ' + level,
      ...((cpu || memory) ? ['--profile-with-cpu'] : []), ...(memory ? ['--profile-with-memory'] : []),
      ...(stack ? ['--profile-with-stack'] : []), ...(shapes ? ['--profile-record-shapes'] : []), '--profile-save-path ' + quote(output.trim())];
    const block = '# MindStudio：本次性能采集\nMSPROF_DEMO_ARGS=(\n' + flags.map(flag => '    ' + flag).join('\n') + '\n)\n\n';
    // Insert before the training command's redirection, preserving its original tee pipeline.
    const pipe = info.command.search(/\s+(?=(?:2>&1\s*)?\|\s*tee\b)/);
    const insertion = pipe < 0 ? info.command.length : pipe;
    const before = info.command.slice(0, insertion).trimEnd();
    const after = info.command.slice(insertion);
    const command = before + ' \\\n    "${MSPROF_DEMO_ARGS[@]}"' + after;
    const script = info.source.slice(0, info.start) + block + command + info.source.slice(info.start + info.command.length);
    const lines = text => text.replace(/\n$/, '').split('\n');
    const originalLines = lines(info.source), modifiedLines = lines(script), blockLines = lines(block);
    const firstLine = info.source.slice(0, info.start).split('\n').length - 1;
    const changedLine = firstLine + info.command.slice(0, insertion).split('\n').length - 1;
    const diff = []; let oldLine = 1, newLine = 1;
    const row = (type, text) => diff.push({ type, text, oldLine: type === 'add' ? null : oldLine++, newLine: type === 'remove' ? null : newLine++ });
    originalLines.forEach((text, index) => {
      if (index === firstLine) blockLines.forEach(text => row('add', text));
      if (index === changedLine) {
        row('remove', text);
        modifiedLines.slice(index + blockLines.length, index + blockLines.length + 2).forEach(text => row('add', text));
      } else row('context', text);
    });
    const line = info.source.slice(0, info.start).split('\n').length;
    return { script, flags, block, diff, insertions: [{ line: firstLine + 1, kind: 'configuration' }, { line: changedLine + 1, kind: 'arguments' }], ranks: rankList.map(Number), changes: '# 在 ' + info.name + ' 第 ' + line + ' 行的训练启动命令之前加入：\n' + block + '# 在该启动命令的参数末尾、日志重定向之前加入：\n    "${MSPROF_DEMO_ARGS[@]}"' };
  }
  const api = { inspect, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LaunchScriptImport = api;
})(globalThis);
