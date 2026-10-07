// 降级路径：IndexedDB 不可用时，行为必须和改造前一模一样。
//
// 这条路径是真实存在的：隐私模式、老浏览器、以及**双击打开本地文件**（file://）——
// 实测 file:// 下 indexedDB.open() 既不回调 success 也不回调 error，会一直挂着，
// 靠 idbOpenDb 里的 3 秒超时兜底。这里用前置注入把 indexedDB 直接抹掉，
// 在 loopback HTTP 下确定性地复现「IDB 不可用」，比依赖 file:// 的行为稳定得多。
try {
  localStorage.clear();
  localStorage.setItem('folio.docs', JSON.stringify({
    docs: [{ id: 'lsdoc', html: '<h1>本地存储里的标签</h1>', file: null, title: '本地存储里的标签' }],
    activeDocId: 'lsdoc'
  }));
  localStorage.setItem('folio.history', JSON.stringify([
    { id: 'h1', html: '<p>本地历史</p>', title: '本地历史', text: '', savedAt: 1 }
  ]));
  // 关键一步：让 typeof indexedDB === 'undefined'，逼应用走降级分支。
  // 先把原始对象存起来 —— 后面还要还原它，用来测「临时降级后恢复」那条路径。
  window.__realIDB = window.indexedDB;
  Object.defineProperty(window, 'indexedDB', {
    configurable: true, get: function () { return undefined; }
  });
  window.__idbKilled = (typeof indexedDB === 'undefined');
} catch (e) { window.__idbKilled = false; }
//@PRE
window.addEventListener('load', function () {
  setTimeout(async function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    var emitted = false;
    function emitResults() {
      if (emitted) return;
      emitted = true;
      var pre = document.createElement('pre');
      pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
      document.body.appendChild(pre);
    }
    setTimeout(emitResults, 15000);
    try {
      await window.__folioReady;
      var S = window.__folioStorage;

      // ---- 守卫 ----
      t('indexedDB 确实已被抹掉（否则本组断言空转）', window.__idbKilled, true);
      t('应用确实退回了 localStorage 后端', S.mode(), 'ls');

      // ---- 数据仍能正常读出来 ----
      t('标签从 localStorage 恢复', activeDocId, 'lsdoc');
      t('标签内容完整', /本地存储里的标签/.test(editor.innerHTML), true);
      t('历史条数一致', getHistory().length, 1);
      t('历史内容完整', getHistory()[0].html, '<p>本地历史</p>');

      // ---- 写入仍然落在 localStorage（这是降级路径的全部意义）----
      setHistory([{ id: 'n1', html: '<p>降级后写入</p>', title: '降级后写入', text: '', savedAt: 2 }]);
      var raw = null;
      try { raw = localStorage.getItem('folio.history'); } catch (e) {}
      t('新写入确实进了 localStorage', /降级后写入/.test(raw || ''), true);
      t('通过存储层也读得回来', /降级后写入/.test(S.get('folio.history') || ''), true);

      // ---- 面板如实显示后端 ----
      document.getElementById('history-modal').hidden = false;
      document.getElementById('history-storage').click();
      var body = document.getElementById('storage-body').innerHTML;
      t('面板显示的是 localStorage 回退模式', /localStorage（回退模式）/.test(body), true);
      t('回退模式下不显示「清理旧副本」按钮', document.getElementById('storage-clean-legacy').hidden, true);
      document.getElementById('storage-close').click();

      // ---- 标签的持久化仍然生效（刷新后能恢复）----
      saveDocsState();
      var saved = JSON.parse(localStorage.getItem('folio.docs') || 'null');
      t('saveDocsState 仍把标签写进 localStorage', !!(saved && saved.docs && saved.docs.length), true);

      // ---- 6. 临时降级 → 恢复：那一轮改过的内容不能被 IDB 的旧数据盖掉 ----
      // 场景：某次打开时 IndexedDB 超时/被阻塞，本轮退回 localStorage 运行，
      // 用户照常编辑；下次 IDB 恢复正常，那些改动必须并回去，而不是无声消失。
      t('「环境没有 IDB」这种降级不该留标记（那是预期内降级，不是故障）',
        localStorage.getItem('folio.lsFallback'), null);

      // 先把 indexedDB 还原，让 IDB 进入「已迁移」的正常状态
      Object.defineProperty(window, 'indexedDB', { configurable: true, get: function () { return window.__realIDB; } });
      await initStorage();
      t('还原后跑回 IndexedDB 后端', S.mode(), 'idb');

      // 造出「IDB 里是旧值」的状态，并把迁移标记置为 true（模拟早已迁完）
      await idbPutMany([['folio.history', JSON.stringify([{ id: 'old', html: '<p>IDB 里的旧历史</p>', title: '旧', savedAt: 1 }])]]);
      await idbPutMany([['__meta', Object.assign({}, S.meta(), { migrated: true })]]);

      // 模拟「这一次 IDB 打不开」：让 idbOpenDb 直接失败（但 indexedDB 对象仍在）
      var realOpenDb = window.idbOpenDb;
      window.idbOpenDb = function () { return Promise.resolve(null); };
      await initStorage();
      t('打不开 IDB 时退回 localStorage', S.mode(), 'ls');
      t('这种降级会留下降级标记', !!localStorage.getItem('folio.lsFallback'), true);

      // 用户在这一轮里改了历史
      setHistory([{ id: 'new', html: '<p>降级这轮写的历史</p>', title: '新', savedAt: 2 }]);

      // 下次启动，IDB 恢复正常
      window.idbOpenDb = realOpenDb;
      await initStorage();
      t('IDB 恢复后回到 IndexedDB 后端', S.mode(), 'idb');
      t('降级那一轮的改动被并回了 IDB（而不是被旧数据盖掉）',
        /降级这轮写的历史/.test(S.get('folio.history') || ''), true);
      t('合并确实落到了盘上', /降级这轮写的历史/.test((await idbGet('folio.history')) || ''), true);
      t('合并完成后清掉了降级标记', localStorage.getItem('folio.lsFallback'), null);
    } catch (e) {
      out.push('FAIL 用例抛错 | ' + (e && e.stack ? e.stack : e));
    }
    emitResults();
  }, 400);
});
