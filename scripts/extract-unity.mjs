import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const source = process.argv[2] || 'C:/UnityProjects/Iron Swarm';
const assets = path.join(source, 'Assets');
const out = 'public/assets';
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync('src/data', { recursive: true });
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const guidMap = new Map();
for (const file of walk(assets).filter((f) => f.endsWith('.meta'))) {
  const match = fs.readFileSync(file, 'utf8').match(/^guid: (.+)$/m);
  if (match) guidMap.set(match[1].trim(), file.slice(0, -5));
}
const docs = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split(/^--- !u!\d+ &(-?\d+).*$/m)
    .slice(1)
    .reduce((all, part, i, arr) => {
      if (i % 2 === 0) all.push({ id: part, ...YAML.parse(arr[i + 1]) });
      return all;
    }, []);
const config = docs(path.join(assets, 'Scripts/BalanceConfig.asset'))[0].MonoBehaviour;
const configText = fs.readFileSync(path.join(assets, 'Scripts/BalanceConfig.asset'), 'utf8');
for (const key of [
  'baseCosts',
  'maxLevels',
  'maxLvPerkBonus',
  'maxLv2PerkBonus',
  'maxLv3PerkBonus',
]) {
  config[key] = configText.match(new RegExp(`^  ${key}: (.+)$`, 'm'))[1].trim();
}
for (const [key, value] of Object.entries(config)) {
  if (key.startsWith('m_')) delete config[key];
  else if (typeof value === 'string' && /^[0-9a-f]+$/.test(value) && value.length % 8 === 0) {
    const buf = Buffer.from(value, 'hex');
    config[key] = Array.from({ length: buf.length / 4 }, (_, i) => buf.readInt32LE(i * 4));
  }
}
const textures = {};
for (const file of walk(path.join(assets, 'Resources')).filter((f) =>
  /\.(png|ttf|mp3|wav|json)$/i.test(f),
)) {
  const relative = path.relative(path.join(assets, 'Resources'), file).replaceAll('\\', '/');
  const target = path.join(out, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
  if (file.endsWith('.png')) {
    const b = fs.readFileSync(file),
      meta = YAML.parse(fs.readFileSync(file + '.meta', 'utf8')).TextureImporter;
    textures[relative.slice(0, -4)] = {
      url: `assets/${relative}`,
      width: b.readUInt32BE(16),
      height: b.readUInt32BE(20),
      ppu: meta.spritePixelsToUnits || 100,
      pivot: meta.spritePivot,
    };
  }
}
const scene = docs(path.join(assets, 'Scenes/Main.unity'));
const prefab = (name) => docs(path.join(assets, `Prefabs/${name}.prefab`));
const objectData = (list) =>
  list
    .filter((d) => d.GameObject)
    .map((d) => {
      const go = d.GameObject;
      const components = list.filter((c) =>
        Object.values(c).some((v) => v && typeof v === 'object' && v.m_GameObject?.fileID == d.id),
      );
      return {
        name: go.m_Name,
        id: d.id,
        components: components.map((c) =>
          Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'id')),
        ),
      };
    });
const geometry = {
  scene: objectData(scene),
  player: objectData(prefab('Player')),
  enemy: objectData(prefab('Enemy')),
  blade: objectData(prefab('PlayerBlade')),
};
const scriptValues = (file, className) => {
  const value = docs(file).find((d) =>
    d.MonoBehaviour?.m_EditorClassIdentifier?.endsWith(`::${className}`),
  ).MonoBehaviour;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key.startsWith('_'))
      .map(([key, value]) => [key.slice(1), value]),
  );
};
const runtime = {
  coin: scriptValues(path.join(assets, 'Resources/Effects/CoinAnimation.prefab'), 'CoinAnimation'),
  damagePopup: scriptValues(
    path.join(assets, 'Resources/Effects/DamagePopup.prefab'),
    'DamagePopup',
  ),
  goldPopup: scriptValues(path.join(assets, 'Resources/Effects/GoldPopup.prefab'), 'GoldPopup'),
  attack: scriptValues(path.join(assets, 'Prefabs/Enemy.prefab'), 'EnemyMeleeAttack'),
};
for (const value of Object.values(runtime)) delete value.fontAsset;
fs.writeFileSync('src/data/runtime.json', JSON.stringify(runtime, null, 2));
const audio = {};
for (const o of geometry.scene)
  for (const c of o.components)
    if (c.AudioSource) {
      const a = c.AudioSource,
        file = guidMap.get(a.m_audioClip?.guid || a.m_Resource?.guid);
      if (file)
        audio[o.name] = {
          url: `assets/${path.relative(path.join(assets, 'Resources'), file).replaceAll('\\', '/')}`,
          volume: a.m_Volume,
          pitch: a.m_Pitch,
          loop: !!a.Loop,
        };
    }
fs.writeFileSync('src/data/balance.json', JSON.stringify(config, null, 2));
fs.writeFileSync('src/data/textures.json', JSON.stringify(textures, null, 2));
fs.writeFileSync('src/data/unity-geometry.json', JSON.stringify(geometry, null, 2));
fs.writeFileSync('src/data/audio.json', JSON.stringify(audio, null, 2));
for (const lang of ['ru', 'en'])
  fs.copyFileSync(
    path.join(assets, `Resources/Localization/${lang}.json`),
    `src/data/${lang}.json`,
  );
let html = fs.readFileSync(path.join(assets, 'UI/MainUI.uxml'), 'utf8');
html = html
  .replace(/<\/?ui:UXML[^>]*>/g, '')
  .replace(/<ui:Style[^>]*\/>/g, '')
  .replace(/<!--[^]*?-->/g, '');
html = html
  .replace(/<ui:(VisualElement|Label|Button)\b([^>]*?)(\/?)>/g, (_, kind, attrs, self) => {
    const tag = kind === 'Button' ? 'button' : kind === 'Label' ? 'span' : 'div';
    const text = attrs.match(/\btext="([^"]*)"/)?.[1] || '';
    attrs = attrs.replace(/\btext="[^"]*"/, '').replace(/\bname=/, 'id=');
    return `<${tag}${attrs}>${text}${self ? `</${tag}>` : ''}`;
  })
  .replace(
    /<\/ui:(VisualElement|Label|Button)>/g,
    (_, k) => `</${k === 'Button' ? 'button' : k === 'Label' ? 'span' : 'div'}>`,
  );
fs.writeFileSync('src/data/ui.html', html);
let css = fs.readFileSync(path.join(assets, 'UI/MainStyle.uss'), 'utf8');
css = css
  .replace(/-unity-font-style:\s*bold;/g, 'font-weight: bold;')
  .replace(/-unity-text-align:\s*middle-center;/g, 'text-align: center;')
  .replace(/-unity-text-align:\s*middle-right;/g, 'text-align: right;')
  .replace(/-unity-text-align:\s*middle-left;/g, 'text-align: left;')
  .replace(/-unity-[\w-]+:[^;]+;/g, '');
fs.writeFileSync('src/data/unity.css', css);
console.log(
  `Extracted ${Object.keys(textures).length} textures, balance, UI, audio and prefab geometry.`,
);
