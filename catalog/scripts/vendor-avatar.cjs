const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const source = join(root, 'node_modules', 'gsap');
const target = join(root, 'vendor', 'gsap');
mkdirSync(target, { recursive: true });
for (const file of ['gsap.min.js', 'MorphSVGPlugin.min.js']) {
  copyFileSync(join(source, 'dist', file), join(target, file));
}
// The npm package includes license links in its README and distribution headers.
copyFileSync(join(source, 'README.md'), join(target, 'README.md'));
console.log('GSAP and MorphSVGPlugin copied to vendor/gsap.');
