// 首次迁移：localStorage → IndexedDB 的自检。
//
// 这个用例必须用前置注入点：迁移发生在**应用启动时**，所以遗留数据要在应用脚本
// 执行之前就塞进 localStorage。后置注入点在应用启动之后，根本测不到这条路径。
try {
  localStorage.clear();
  localStorage.setItem('folio.docs', JSON.stringify({
    docs: [{ id: 'legacy1', html: '<h1>迁移过来的标签</h1><p>正文</p>', file: 'old.md', title: '迁移过来的标签' }],
    activeDocId: 'legacy1'
  }));
  localStorage.setItem('folio.history', JSON.stringify([
    { id: 'h1', html: '<p>历史一</p>', title: '历史一', text: '', savedAt: 1 },
    { id: 'h2', html: '<p>历史二</p>', title: '历史二', text: '', savedAt: 2 }
  ]));
  localStorage.setItem('folio.library', JSON.stringify([
    { id: 'L1', title: '库文档', html: '<p>库内容</p>', category: '', savedAt: 3, updatedAt: 3 }
  ]));
  localStorage.setItem('folio.draft', JSON.stringify({ html: '<p>遗留草稿</p>', title: '遗留草稿', savedAt: 4 }));
  localStorage.setItem('folio.snapshots', JSON.stringify([
    { id: 's1', html: '<p>快照一</p>', title: '快照一', text: '', savedAt: 5 }
  ]));
  localStorage.setItem('folio.zoom', '1.5');   // 小键：应当留在 localStorage，不参与迁移
  window.__legacySeeded = true;
} catch (e) { window.__legacySeeded = false; }
//@PRE
window.addEventListener('load', function () {
  setTimeout(async function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    async function waitUntil(fn, tries) {
      for (var i = 0; i < (tries || 150); i++) {
        if (fn()) return true;
        await new Promise(function (r) { setTimeout(r, 20); });
      }
      return false;
    }
    var emitted = false;
    function emit() {
      if (emitted) return;
      emitted = true;
      var pre = document.createElement('pre');
      pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
      document.body.appendChild(pre);
    }
    // 兜底：万一某一步永远不 resolve（例如迁移没启用时 IDB 里根本没有建过库），
    // 也要把已经攒下的结果交回来 —— 否则表现只是「等结果超时」，
    // 连前面那些明确 FAIL 的断言都看不到，RED 验证也就无从谈起。
    setTimeout(emit, 15000);
    // 抛错时必须把错因也交回来，理由同上
    try {
      await runAll();
    } catch (e) {
      out.push('FAIL 用例抛错 | ' + (e && e.stack ? e.stack : e));
    }
    emit();
    return;

    async function runAll() {
    await window.__folioReady;
    var S = window.__folioStorage;

    // ---- 0. 前置守卫：环境与预置都得成立，否则下面全是空转 ----
    t('遗留数据已预置（否则测不到迁移）', window.__legacySeeded, true);
    t('环境支持 IndexedDB', typeof indexedDB !== 'undefined', true);
    t('迁移后确实跑在 IndexedDB 上', S.mode(), 'idb');
    var meta = S.meta();
    t('迁移标记记在 IndexedDB 里（不是 localStorage）', !!(meta && meta.migrated), true);
    t('localStorage 里没有迁移标记（否则被清掉就会拿旧数据盖新数据）',
      (function () { try { return localStorage.getItem('folio.__meta') !== null; } catch (e) { return false; } })(), false);

    // ---- 1. 数据一份不少地过来了 ----
    t('标签恢复出来了', activeDocId, 'legacy1');
    t('标签内容完整', /迁移过来的标签/.test(editor.innerHTML), true);
    t('历史条数一致', getHistory().length, 2);
    t('历史内容完整', getHistory()[0].html, '<p>历史一</p>');
    t('知识库条数一致', getLibrary().length, 1);
    t('知识库内容完整', getLibrary()[0].html, '<p>库内容</p>');
    t('快照条数一致', getSnapshots().length, 1);
    t('草稿也搬过来了', S.get('folio.draft') !== null, true);

    // ---- 2. 迁移的核心安全不变量 ----
    // 逐字节比对：IDB 与 localStorage 必须完全一致，否则迁移就是有损的
    var same = true;
    S.keys().forEach(function (k) {
      var local = null;
      try { local = localStorage.getItem(k); } catch (e) {}
      if (S.get(k) !== local) same = false;
    });
    t('IDB 里的值与 localStorage 逐字节一致（迁移无损）', same, true);
    // 关键：迁移只读不删。删不删由用户在面板里显式决定，不能替用户做主
    t('迁移没有删除 localStorage 的旧副本', S.legacyInLocalStorage().length, 5);
    // 小键不参与迁移，仍留在 localStorage
    t('设置类小键仍留在 localStorage', localStorage.getItem('folio.zoom'), '1.5');
    t('纸面缩放按小键正常生效', zoomLevel, 1.5);

    // ---- 3. 写入必须真的走 IDB，而不是继续写 localStorage ----
    var beforeLocal = localStorage.getItem('folio.history');
    setHistory([{ id: 'new1', html: '<p>新历史</p>', title: '新历史', text: '', savedAt: 9 }]);
    await waitUntil(function () { return /新历史/.test(S.get('folio.history') || ''); }, 50);
    t('新写入进了 IDB', /新历史/.test(S.get('folio.history') || ''), true);
    t('新写入没有再去改 localStorage（旧副本原样不动）', localStorage.getItem('folio.history'), beforeLocal);

    // ---- 4. 中断迁移的续跑：幂等、不丢数据 ----
    var m2 = Object.assign({}, S.meta(), { migrated: false });
    // 直接操作 IDB 造出「搬到一半断了」的状态。
    // 每一步都兜底 res()：迁移没启用时 IDB 里压根没建过库，这里会抛错，
    // 不兜的话 Promise 永远不 resolve，整个用例就卡死而不是明确失败。
    await new Promise(function (res) {
      try {
        var rq = indexedDB.open('folio', 1);
        rq.onerror = res; rq.onblocked = res;
        rq.onsuccess = function (e) {
          try {
            var t2 = e.target.result.transaction('kv', 'readwrite');
            t2.objectStore('kv').put(m2, '__meta');
            t2.oncomplete = res; t2.onerror = res; t2.onabort = res;
          } catch (err) { res(); }
        };
      } catch (err) { res(); }
    });
    await initStorage();
    t('中断后重跑迁移不丢数据', getHistory().length, 1);
    t('中断后重跑会把标记重新置为 true（不会永远停在 false）', S.meta().migrated, true);

    // ---- 4b. 迁移只能是一次性的：删掉的东西不能在下一次启动自己回来 ----
    // 迁移故意不删 localStorage 旧副本（那是保险）。但如果每次启动都去搬「IDB 里没有的键」，
    // 那么用户**在 IDB 里删掉**的任何东西，都会被旧副本重新灌回去 —— 删了的东西自己回来。
    await storeSetDurable('folio.draft', 'null');
    safeRemove('folio.draft');
    t('删除后 IDB 里确实没有 draft 了', (await idbGet('folio.draft')) === undefined, true);
    t('localStorage 里仍留着 draft 旧副本（迁移不删）',
      (function () { try { return localStorage.getItem('folio.draft') !== null; } catch (e) { return false; } })(), true);
    await initStorage();     // 模拟「下一次启动」
    t('再次启动不会把已删除的 draft 从旧副本灌回来', (await idbGet('folio.draft')) === undefined, true);
    t('内存镜像里也没有复活', S.get('folio.draft'), null);

    // ---- 5. 清理旧副本：只有逐字节一致才允许删 ----
    // 上一步的写入已经让 folio.history 的旧副本与 IDB 不一致了 —— 正好用来验证
    // 「不一致就保留」这条规则（不能赌哪份更新，赌错就是不可逆的数据丢失）。
    t('上一步的写入让 history 旧副本与 IDB 不再一致',
      localStorage.getItem('folio.history') !== S.get('folio.history'), true);
    var res = await cleanLegacyCopies();
    t('不一致的 history 旧副本被保留', res.kept.indexOf('folio.history') !== -1, true);
    // 上一节把 draft 从 IDB 删掉了 —— IDB 里没有这个键，就不该当作「可清理的副本」
    t('IDB 里已删除的 draft 旧副本也被保留（不敢当作可清理）', res.kept.indexOf('folio.draft') !== -1, true);
    t('逐字节一致的 3 份被清掉', res.removed.slice().sort().join(','), 'folio.docs,folio.library,folio.snapshots');
    t('剩下的正是那两份', S.legacyInLocalStorage().slice().sort().join(','), 'folio.draft,folio.history');
    t('清理旧副本不影响 IDB 里的文档数量', getLibrary().length, 1);
    t('清理旧副本不影响标签', activeDocId, 'legacy1');

    // 让两份旧副本重新与 IDB 对齐，再清一次，应当能清干净
    await storeSetDurable('folio.draft', localStorage.getItem('folio.draft'));
    localStorage.setItem('folio.history', S.get('folio.history'));
    var res2 = await cleanLegacyCopies();
    t('对齐后可以清干净', res2.removed.slice().sort().join(','), 'folio.draft,folio.history');
    t('localStorage 里已无大键副本', S.legacyInLocalStorage().length, 0);
    }
  }, 300);
});
