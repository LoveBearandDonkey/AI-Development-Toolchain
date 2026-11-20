const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const workspace = path.dirname(root);
const html = fs.readFileSync(path.join(workspace, 'catalog.html'), 'utf8');
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const src = match[1].match(/src="([^"]+)"/);
  if (src) execFileSync(process.execPath, ['--check', path.join(workspace, src[1])], { stdio: 'inherit' });
  else new vm.Script(match[2], { filename: 'catalog.html inline script' });
}
for (const file of ['serve.cjs', 'vendor-avatar.cjs', 'check-avatar.cjs']) {
  execFileSync(process.execPath, ['--check', path.join(__dirname, file)], { stdio: 'inherit' });
}
for (const asset of ['catalog.css', 'vendor/gsap/gsap.min.js', 'vendor/gsap/MorphSVGPlugin.min.js']) {
  if (!fs.statSync(path.join(root, asset)).size) throw new Error(`Missing asset: ${asset}`);
}
console.log('Catalog scripts parse and local avatar assets are present.');
