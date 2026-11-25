import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '..');
const development = process.argv.includes('--dev');
const devServer = development ? await (await import('vite')).createServer({
  root, configFile: false, publicDir: 'public',
  server: { middlewareMode: true, hmr: false, watch: { ignored: ['**/.tools/**', '**/qa/**', '**/export/**', '**/releases/**'] } }, appType: 'spa',
}) : null;
const screenshotPrefix = development ? 'development' : 'gdevelop';
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (development) {
    if (url.pathname === '/__check-host/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><html><body style="margin:0"><iframe id="iron-swarm-frame" src="/?dev" allow="autoplay; fullscreen" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>');
    } else devServer.middlewares(req, res);
    return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname) + (url.pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try { res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${path.join(root, '.tools', `browser-profile-${process.pid}`)}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1280,720', 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let diagnostics = '';
chrome.stderr.on('data', b => { diagnostics += b.toString(); });
let socket;
const failures = [], browserErrors = [], requests = [];
let nextId = 0;
const callbacks = new Map();
try {
  for (let i = 0; i < 100 && !/DevTools listening on (ws:\/\/[^\s]+)/.test(diagnostics); i++) await delay(100);
  const browserSocket = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
  if (!browserSocket) throw new Error('Chrome did not start: ' + diagnostics.slice(-1000));
  const debugOrigin = browserSocket.replace(/^ws:/, 'http:').replace(/\/devtools\/.*/, '');
  const targets = await (await fetch(debugOrigin + '/json/list')).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const callback = callbacks.get(message.id); callbacks.delete(message.id); message.error ? callback?.reject(new Error(JSON.stringify(message.error))) : callback?.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (message.method === 'Network.loadingFailed') failures.push(message.params.errorText);
    if (message.method === 'Network.requestWillBeSent' && /^https?:/.test(message.params.request.url)) requests.push(message.params.request.url);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { callbacks.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    callbacks.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error('Timed out: ' + expression + '; audio=' + JSON.stringify(await evaluate(`document.querySelector('iframe')?.contentWindow.__audioCheck`)));
  };
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__audioCheck = { decoded: 0, started: 0 };
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      async decodeAudioData(...args) { const result = await super.decodeAudioData(...args); window.__audioCheck.decoded++; return result; }
      createBufferSource() { const source = super.createBufferSource(); const start = source.start.bind(source); source.start = (...args) => { window.__audioCheck.started++; return start(...args); }; return source; }
    };
  ` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}${development ? '/__check-host/' : '/export/?dev'}` });
  const w = 'document.querySelector("#iron-swarm-frame")?.contentWindow';
  await waitFor(`!!(${w})?.document.querySelector('#LanguageScreen')`);
  assert.equal(await evaluate(`(${w}).document.querySelector('input[name="start-language"]:checked').value`), 'en');
  await delay(200);
  assert.equal(await evaluate(`!!(${w}).ironSwarm || !!(${w}).document.getElementById('DialoguePanel')`), false, 'language choice must precede the game and dialogue');
  assert.equal(await evaluate(`(${w}).localStorage.getItem('iron-swarm.save.v1')`), null, 'language screen must not overwrite progress');
  fs.writeFileSync(path.join(root, `qa/${screenshotPrefix}-language.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate(`(()=>{const w=${w};w.document.querySelector('input[value="ru"]').click();w.document.getElementById('LanguageContinue').click();})()`);
  await waitFor(`!!(${w})?.ironSwarm`);
  assert.equal(await evaluate(`(${w}).document.documentElement.lang`), 'ru');
  await waitFor(`(${w}).document.getElementById('DialogueText').textContent.length > 0`);
  const russianGreeting = JSON.parse(fs.readFileSync(path.join(root, 'src/data/ru.json'), 'utf8')).dialogue_tut_1;
  assert.equal(await evaluate(`(${w}).document.getElementById('DialogueText').textContent`), russianGreeting);
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`!!(${w})?.ironSwarm`);
  assert.equal(await evaluate(`!!(${w}).document.getElementById('LanguageScreen')`), false);
  assert.equal(await evaluate(`(${w}).document.documentElement.lang`), 'ru');
  await waitFor(`!(${w}).document.querySelector('#boot')`);
  const initial = await evaluate(`(()=>{const w=${w};return {canvas:w.document.querySelector('#world canvas')?.width,dialogue:w.ironSwarm.session.dialogue?.index,gold:w.ironSwarm.session.state.gold,missingIcons:[...w.document.querySelectorAll('[style]')].filter(e=>e.style.backgroundImage.includes('undefined')).length}})()`);
  assert.deepEqual(initial, { canvas: 1920, dialogue: 0, gold: 1000, missingIcons: 0 });
  fs.writeFileSync(path.join(root, `qa/${screenshotPrefix}-initial.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate(`(()=>{const w=${w};w.document.getElementById('SettingsToggle').click();})()`);
  assert.equal(await evaluate(`(${w}).ironSwarm.session.settingsOpen`), true);
  assert.equal(await evaluate(`(${w}).document.querySelectorAll('#feedback-message, #diagnostics-export, [data-setting-text="feedback_title"], textarea').length`), 0);
  assert.equal(await evaluate(`(${w}).document.querySelectorAll('#export-save, #import-save, input[type="file"]').length`), 0);
  assert.equal(await evaluate(`(${w}).document.getElementById('SettingsDialog').textContent.includes('Экспорт')`), false);
  const before = await evaluate(`(${w}).ironSwarm.snapshot()`);
  await delay(200);
  const after = await evaluate(`(${w}).ironSwarm.snapshot()`);
  assert.equal(after.time, before.time, 'settings pause must freeze game clock');
  await evaluate(`(()=>{const w=${w};w.document.getElementById('language').value='en';w.document.getElementById('language').dispatchEvent(new Event('change'));})()`);
  await waitFor(`(${w}).document.documentElement.lang === 'en'`);
  assert.equal(await evaluate(`(${w}).document.getElementById('SettingsDialog').textContent.includes('Export your progress')`), false);
  fs.writeFileSync(path.join(root, `qa/${screenshotPrefix}-settings.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate(`(()=>{const w=${w};w.document.getElementById('SettingsClose').click();while(w.ironSwarm.session.dialogue)w.document.getElementById('DialogueNextBtn').click();})()`);
  // Use the actual upgrade button and verify progression survives GDevelop export reloads.
  await evaluate(`(()=>{const w=${w};w.document.getElementById('Btn_HealthMax').click();w.ironSwarm.jump(21);w.document.getElementById('save-browser').click();})()`);
  assert.equal(await evaluate(`(${w}).ironSwarm.session.state.levels[0]`), 1);
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`!!(${w})?.ironSwarm`);
  assert.equal(await evaluate(`!!(${w}).document.getElementById('LanguageScreen')`), false);
  assert.equal(await evaluate(`(${w}).ironSwarm.session.state.levels[0]`), 1);
  assert.equal(await evaluate(`(${w}).ironSwarm.session.state.wave`), 21);
  assert.equal(await evaluate(`(${w}).document.documentElement.lang`), 'en');
  await evaluate(`(()=>{const w=${w};w.ironSwarm.jump(21);while(w.ironSwarm.session.dialogue)w.ironSwarm.session.advanceDialogue();w.document.getElementById('MenuToggle').click();})()`);
  assert.equal(await evaluate(`(${w}).ironSwarm.session.menuOpen`), true);
  await evaluate(`(()=>{const w=${w};w.document.getElementById('SettingsToggle').click();w.document.getElementById('SettingsClose').click();})()`);
  assert.equal(await evaluate(`(${w}).ironSwarm.session.menuOpen && (${w}).ironSwarm.session.paused`), true);
  // Input goes to the inner game, including audio activation and Esc.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor(`(${w}).ironSwarm.session.settingsOpen`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 400, y: 300, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 400, y: 300, button: 'left', clickCount: 1 });
  await waitFor(`(${w}).__audioCheck.decoded === 10 && (${w}).__audioCheck.started > 0`);
  const audio = await evaluate(`(${w}).__audioCheck`);
  await evaluate(`(()=>{const w=${w};w.__fullscreenCheck={};const original=w.Element.prototype.requestFullscreen;w.Element.prototype.requestFullscreen=function(...args){w.__fullscreenCheck.called=true;return original.apply(this,args).catch(e=>{w.__fullscreenCheck.error=e.message;throw e;});};})()`);
  const fullscreenButton = await evaluate(`(()=>{const r=(${w}).document.getElementById('fullscreen').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...fullscreenButton, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...fullscreenButton, button: 'left', clickCount: 1 });
  await delay(150);
  const fullscreen = await evaluate(`({active:!!(${w}).document.fullscreenElement,enabled:(${w}).document.fullscreenEnabled,error:(${w}).__fullscreenCheck.error})`);
  if (fullscreen.active) await evaluate(`(${w}).document.exitFullscreen()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 450, deviceScaleFactor: 1, mobile: false });
  await delay(150);
  assert.equal(await evaluate(`(${w}).innerWidth`), 800);
  fs.writeFileSync(path.join(root, `qa/${screenshotPrefix}-800.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  // Players with an older save but no preferences must resume directly as well.
  await evaluate(`(${w}).localStorage.removeItem('iron-swarm.preferences.v1')`);
  await send('Page.reload', { ignoreCache: true });
  await waitFor(`!!(${w})?.ironSwarm`);
  assert.equal(await evaluate(`!!(${w}).document.getElementById('LanguageScreen')`), false);
  assert.equal(await evaluate(`(${w}).ironSwarm.session.state.wave`), 21);
  assert.equal(browserErrors.length, 0, browserErrors.join('\n'));
  assert.equal(failures.length, 0, failures.join('\n'));
  assert.equal(requests.filter(url => !url.startsWith(`http://127.0.0.1:${port}/`)).length, 0, 'game must not need an external host');
  await send('Page.navigate', { url: `http://127.0.0.1:${port}${development ? '/?dev' : '/dist/?dev'}` });
  await waitFor('!!window.ironSwarm');
  await evaluate(`document.getElementById('SettingsToggle').click();window.__fullscreenCheck={};const original=Element.prototype.requestFullscreen;Element.prototype.requestFullscreen=function(...args){window.__fullscreenCheck.called=true;return original.apply(this,args).catch(e=>{window.__fullscreenCheck.error=e.message;throw e;});};`);
  const originalButton = await evaluate(`(()=>{const r=document.getElementById('fullscreen').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...originalButton, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...originalButton, button: 'left', clickCount: 1 });
  await delay(200);
  fullscreen.original = await evaluate(`({active:!!document.fullscreenElement,error:window.__fullscreenCheck.error})`);
  assert.equal(fullscreen.active, fullscreen.original.active, 'embedded fullscreen behavior must match original');
  const report = { passed: true, mode: development ? 'Vite development; no build produced' : 'GDevelop HTML5 export', initial, audio, fullscreen, checks: ['language screen on first launch only', 'English default', 'Russian dialogue', 'Russian language survives reload without picker', 'wave 21 resumes directly after reload', 'older saves without preferences skip picker', 'feedback UI removed', 'import/export controls removed', 'export hint removed in both languages', '1920x1080 renderer', 'UI assets', 'settings pause', 'language change', 'upgrade', 'save/reload', 'preferences/reload', 'wave 21 skill tree', 'nested settings/tree pause', 'keyboard Esc', 'all 10 audio channels decode', 'audio playback', 'fullscreen matches original in test browser', '800x450 resize', 'no external asset requests', 'no browser exceptions'], browserErrors, failures };
  fs.writeFileSync(path.join(root, development ? 'qa/development-browser-check.json' : 'qa/browser-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  socket?.close(); chrome.kill(); server.closeAllConnections(); server.close(); await devServer?.close();
}
