// Runs as a GDevelop JavaScript event. The original game owns its rendering,
// controls, audio and saves inside a same-origin document.
// The package is downloaded here (not preloaded by GDevelop) so the player
// sees real byte progress instead of a bar that waits for one large file.
if (!runtimeScene.__ironSwarmHost) {
  const game = runtimeScene.getGame();
  const expectedBytes = __IRON_SWARM_PACKAGE_BYTES__;
  const stallSeconds = 15;
  const startSeconds = 30;

  const russian = (function () {
    try {
      const saved = JSON.parse(localStorage.getItem('iron-swarm.preferences.v1') || 'null');
      if (saved && (saved.language === 'ru' || saved.language === 'en')) return saved.language === 'ru';
    } catch (e) {}
    return /^ru\b/i.test(navigator.language || '');
  })();
  const text = russian
    ? {
        loading: 'Загрузка игры',
        slow: 'Загрузка идёт дольше обычного. Проверьте подключение к интернету.',
        failed: 'Не удалось загрузить игру. Проверьте подключение и попробуйте снова.',
        retry: 'Повторить',
        notStarted: 'Игра не запустилась. Обновите страницу или включите аппаратное ускорение в браузере.',
        reload: 'Обновить страницу',
        hide: 'Скрыть',
        mb: 'МБ',
      }
    : {
        loading: 'Loading the game',
        slow: 'Loading is taking longer than usual. Please check your connection.',
        failed: 'The game could not be loaded. Check your connection and try again.',
        retry: 'Retry',
        notStarted: 'The game did not start. Refresh the page or enable hardware acceleration in your browser.',
        reload: 'Refresh page',
        hide: 'Hide',
        mb: 'MB',
      };

  const host = document.createElement('div');
  host.id = 'iron-swarm-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:100;background:#14141e;color:#dcdcf0;display:flex;align-items:center;justify-content:center;font:20px monospace';
  document.body.appendChild(host);
  runtimeScene.__ironSwarmHost = host;

  const card = document.createElement('div');
  card.style.cssText = 'width:min(560px,86vw);text-align:center';
  card.innerHTML =
    '<div style="font-size:32px;letter-spacing:4px;color:#e6c76c;margin-bottom:24px">IRON SWARM</div>' +
    '<div data-part="title" style="margin-bottom:14px"></div>' +
    '<div style="height:20px;border:3px solid #66667e;background:#282839;padding:2px">' +
    '<div data-part="bar" style="height:100%;width:0;background:#e6c76c;transition:width .2s"></div></div>' +
    '<div data-part="status" style="margin-top:12px;font-size:16px;color:#a2a2bb;min-height:20px"></div>' +
    '<div data-part="note" style="margin-top:16px;font-size:16px;line-height:1.4;color:#ffe38c"></div>' +
    '<div data-part="actions" style="margin-top:16px"></div>';
  const part = function (name) { return card.querySelector('[data-part="' + name + '"]'); };
  const button = function (label, action) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:18px monospace;padding:10px 22px;margin:0 6px;background:#282839;color:#dcdcf0;border:3px solid #66667e;cursor:pointer';
    b.onclick = action;
    return b;
  };

  let request = null;
  let stallTimer = null;
  let startTimer = null;
  const clearTimers = function () {
    clearTimeout(stallTimer);
    clearTimeout(startTimer);
  };

  // Clean up the independent rendering/audio context when leaving this scene.
  if (!gdjs.__ironSwarmCleanupRegistered) {
    gdjs.__ironSwarmCleanupRegistered = true;
    gdjs.registerRuntimeSceneUnloadedCallback(function (scene) {
      if (scene.__ironSwarmHost) {
        if (scene.__ironSwarmCleanup) scene.__ironSwarmCleanup();
        scene.__ironSwarmHost.remove();
        delete scene.__ironSwarmHost;
      }
    });
  }

  const progress = function (share, bytes) {
    part('bar').style.width = Math.round(share * 100) + '%';
    part('status').textContent =
      Math.round(share * 100) + '% · ' + (bytes / 1048576).toFixed(1) + ' / ' + (expectedBytes / 1048576).toFixed(1) + ' ' + text.mb;
  };
  const armStall = function () {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(function () {
      part('note').textContent = text.slow;
      part('actions').replaceChildren(button(text.retry, load));
    }, stallSeconds * 1000);
  };
  const fail = function (error) {
    console.error('Iron Swarm package could not be loaded', error);
    clearTimers();
    part('note').textContent = text.failed;
    part('actions').replaceChildren(button(text.retry, load));
  };

  const onMessage = function (event) {
    const frame = document.getElementById('iron-swarm-frame');
    if (!frame || event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'iron-swarm:ready' || event.data.type === 'iron-swarm:failed') {
      clearTimeout(startTimer);
      const notice = document.getElementById('iron-swarm-notice');
      if (notice) notice.remove();
    }
  };
  window.addEventListener('message', onMessage);
  runtimeScene.__ironSwarmCleanup = function () {
    clearTimers();
    if (request) request.abort();
    window.removeEventListener('message', onMessage);
  };

  const start = function (payload) {
    clearTimers();
    const frame = document.createElement('iframe');
    frame.id = 'iron-swarm-frame';
    frame.title = 'Iron Swarm';
    frame.allow = 'autoplay; fullscreen';
    frame.allowFullscreen = true;
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#000';
    frame.onload = function () { frame.contentWindow.focus(); };
    frame.srcdoc = payload.html;
    host.replaceChildren(frame);
    // If the game never reports that it started, offer a way out instead of an endless screen.
    startTimer = setTimeout(function () {
      if (!host.isConnected) return;
      const notice = document.createElement('div');
      notice.id = 'iron-swarm-notice';
      notice.style.cssText = 'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(640px,90vw);padding:16px;background:#282839;border:3px solid #e6c76c;text-align:center;font:16px/1.4 monospace;color:#dcdcf0';
      notice.textContent = text.notStarted;
      const actions = document.createElement('div');
      actions.style.marginTop = '12px';
      actions.append(
        button(text.reload, function () { location.reload(); }),
        button(text.hide, function () { notice.remove(); }),
      );
      notice.appendChild(actions);
      host.appendChild(notice);
    }, startSeconds * 1000);
  };

  const accept = function (payload) {
    if (!host.isConnected) return;
    if (!payload || typeof payload.html !== 'string') return fail(new Error('Invalid package'));
    progress(1, expectedBytes);
    start(payload);
  };

  // Older engines without these loader methods fall back to the engine's own JSON loading.
  const legacyLoad = function () {
    part('status').textContent = '…';
    game.getJsonManager().loadJson('IronSwarmPackage', function (error, payload) {
      if (!host.isConnected) return;
      if (error) return fail(error);
      accept(payload);
    });
  };

  const load = function () {
    clearTimers();
    if (request) request.abort();
    request = null;
    host.replaceChildren(card);
    part('title').textContent = text.loading;
    part('note').textContent = '';
    part('actions').replaceChildren();
    progress(0, 0);
    armStall();
    const loader = game.getResourceLoader && game.getResourceLoader();
    const resource = loader && loader.getResource && loader.getResource('IronSwarmPackage');
    if (!resource || !loader.getFullUrl) return legacyLoad();
    const xhr = new XMLHttpRequest();
    request = xhr;
    xhr.responseType = 'json';
    xhr.withCredentials = loader.checkIfCredentialsRequired ? loader.checkIfCredentialsRequired(resource.file) : false;
    xhr.open('GET', loader.getFullUrl(resource.file));
    xhr.onprogress = function (event) {
      armStall();
      part('note').textContent = '';
      part('actions').replaceChildren();
      const total = event.lengthComputable && event.total > 0 ? event.total : expectedBytes;
      progress(Math.min(0.99, event.loaded / total), Math.min(event.loaded, expectedBytes));
    };
    xhr.onload = function () {
      if (request !== xhr) return;
      request = null;
      if (xhr.status !== 200 && xhr.status !== 0) return fail(new Error('HTTP ' + xhr.status));
      accept(xhr.response);
    };
    xhr.onerror = function () { if (request === xhr) { request = null; fail(new Error('Network error')); } };
    xhr.send();
  };
  load();
}
