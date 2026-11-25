import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist');
const textures = JSON.parse(fs.readFileSync('src/data/textures.json', 'utf8'));
const audio = JSON.parse(fs.readFileSync('src/data/audio.json', 'utf8'));
for (const asset of [...Object.values(textures), ...Object.values(audio)]) {
  assert.ok(fs.existsSync(path.join(root, asset.url)), `Missing asset: ${asset.url}`);
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.[^"]+)"/g)) {
  assert.ok(fs.existsSync(path.resolve(root, match[1])), `Missing entry: ${match[1]}`);
}
for (const file of fs.readdirSync(path.join(root, 'assets')).filter(file => file.endsWith('.css'))) {
  const cssPath = path.join(root, 'assets', file);
  const css = fs.readFileSync(cssPath, 'utf8');
  for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (match[1].startsWith('data:')) continue;
    const resource = match[1].startsWith('/')
      ? path.join(root, match[1])
      : path.resolve(path.dirname(cssPath), match[1]);
    assert.ok(fs.existsSync(resource), `Missing CSS resource: ${match[1]}`);
  }
}
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = walk(root);
console.log(`Verified ${Object.keys(textures).length} textures, ${Object.keys(audio).length} audio channels and all HTML/CSS asset references.`);
console.log(`Production output: ${files.length} files, ${(files.reduce((sum, file) => sum + fs.statSync(file).size, 0) / 1e6).toFixed(2)} MB uncompressed.`);
