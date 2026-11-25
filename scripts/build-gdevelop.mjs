import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const mime = { '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.json': 'application/json' };
const assets = Object.fromEntries(walk('public/assets').map(file => {
  const name = file.replaceAll('\\', '/').replace(/^public\//, '');
  return [name, `data:${mime[path.extname(file)]};base64,${fs.readFileSync(file).toString('base64')}`];
}));
const resolveAsset = expression => `(globalThis.__ironSwarmAssets[${expression}])`;
const inlineCSS = css => css.replace(/url\((['"]?)(\/?assets\/[^)'"\s]+)\1\)/g, (_, quote, url) => {
  const value = assets[url.replace(/^\//, '')];
  if (!value) throw new Error(`Unknown CSS asset: ${url}`);
  return `url("${value}")`;
});

const result = await build({
  configFile: false,
  root,
  publicDir: false,
  plugins: [{
    name: 'iron-swarm-self-contained',
    enforce: 'pre',
    transform(code, id) {
      if (id.endsWith('.css')) return inlineCSS(code);
      if (id.endsWith('/main.ts')) return code.replace("new URLSearchParams(location.search).has('dev')", "new URLSearchParams(parent.location.search).has('dev')");
      if (id.endsWith('/view/world.ts')) return code.replace('Assets.load<Texture>(cfg.url)', `Assets.load<Texture>(${resolveAsset('cfg.url')})`);
      if (id.endsWith('/platform/audio.ts')) return code.replace('fetch(cfg.url)', `fetch(${resolveAsset('cfg.url')})`);
      if (id.endsWith('/view/ui.ts')) return code
        .replace("'url(\"assets/Textures/UI/Coin.png\")'", '`url("${globalThis.__ironSwarmAssets["assets/Textures/UI/Coin.png"]}")`')
        .replace('`url("assets/Textures/UI/${name}.png")`', '`url("${globalThis.__ironSwarmAssets[`assets/Textures/UI/${name}.png`]}")`');
    },
  }],
  build: {
    write: false,
    target: 'es2022',
    assetsInlineLimit: Infinity,
    cssCodeSplit: false,
    minify: true,
    lib: { entry: path.join(root, 'src/main.ts'), name: 'IronSwarm', formats: ['iife'] },
    chunkSizeWarningLimit: 1500,
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
const js = outputs.filter(o => o.type === 'chunk').map(o => o.code).join('\n');
const css = outputs.filter(o => o.fileName.endsWith('.css')).map(o => String(o.source)).join('\n');
if (outputs.filter(o => o.type === 'chunk').length !== 1) throw new Error('Game must have one inline JavaScript bundle');
const scriptSafe = value => value.replace(/<\/script/gi, '<\\/script');
// srcdoc inherits the export origin, so localStorage and save downloads keep working.
// No sandbox attribute is used: the game needs ordinary browser functionality.
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Iron Swarm</title><style>${css}</style></head><body><div id="viewport"><main id="game"><div id="world"></div><div id="ui"></div></main></div><script>globalThis.__ironSwarmAssets=${scriptSafe(JSON.stringify(assets))};</script><script>${scriptSafe(js)}</script></body></html>`;
fs.mkdirSync('resources', { recursive: true });
const packageText = JSON.stringify({ version: 1, html });
fs.writeFileSync('resources/iron-swarm-package.json', packageText);
const bootstrapSource = fs.readFileSync('scripts/gdevelop-bootstrap.js', 'utf8');
if (!bootstrapSource.includes('__IRON_SWARM_PACKAGE_BYTES__')) throw new Error('Bootstrap size placeholder is missing');
const bootstrap = bootstrapSource.replace('__IRON_SWARM_PACKAGE_BYTES__', String(Buffer.byteLength(packageText)));
const project = JSON.parse(fs.readFileSync('game.json', 'utf8'));
// The bootstrap downloads the package itself and shows byte progress.
const packageResource = project.resources.resources.find(r => r.name === 'IronSwarmPackage');
if (!packageResource) throw new Error('IronSwarmPackage resource is missing');
packageResource.disablePreload = true;
project.layouts[0].events = [
  { type: 'BuiltinCommonInstructions::Comment', color: { b: 112, g: 84, r: 44, textB: 255, textG: 255, textR: 255 }, comment: 'Iron Swarm: исходная игра TypeScript/PixiJS. Запустите предпросмотр. Код запуска ниже, исходники в src/. После правок: npm run build:gdevelop. Ресурс IronSwarmPackage обязателен для экспорта.' },
  { type: 'BuiltinCommonInstructions::JsCode', inlineCode: bootstrap, parameterObjects: '', useStrict: true, eventsSheetExpanded: false },
];
fs.writeFileSync('game.json', JSON.stringify(project, null, 2) + '\n');
const hashes = Object.fromEntries(walk('src').map(file => [file.replaceAll('\\', '/'), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
fs.writeFileSync('qa/source-hashes.json', JSON.stringify(hashes, null, 2) + '\n');
console.log(`GDevelop package: ${Object.keys(assets).length} assets, ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB; game.json updated.`);
