// 存储安全层（阶段一）自检：
//   · 预算按 UTF-16 字节计，而不是字符（这是「localStorage 早早塞满」的根因）
//   · 撞到配额时才腾挪，且只收缩历史/快照，绝不自动删用户的文档
//   · 「存入知识库」写盘失败时不再假报成功
//   · 备份 v4 补齐 activeDocId / zoom / splitPrefs / pdfOpts / selOff，且默认不含 API 密钥
//   · 备份导入能把这些键还原回去
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(async function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    // 异步断言：先算好再判，避免把 Promise 当成值比较（那样永远不等、看起来像失败）
    function ta(name, got, want) { t(name, got, want); }
    // 轮询等待，不要用固定 sleep 去等 FileReader —— 实测在 Edge 上会偶发没跑完就断言，
    // 表现为「同一个用例时绿时红」。用尝试次数而不是时钟，避免受 --virtual-time 影响。
    // 结果输出。做成函数 + 定时兜底：万一某一步永远不 resolve，
    // 也要把已经攒下的断言交回来 —— 否则表现只是「等结果超时」，
    // 前面那些明确的 FAIL 一条都看不到（RED 验证就无从谈起）。
    var emitted = false;
    function emitResults() {
      if (emitted) return;
      emitted = true;
      var preOut = document.createElement('pre');
      preOut.id = 'zz-results';
      preOut.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
      document.body.appendChild(preOut);
    }
    setTimeout(emitResults, 20000);
    async function waitUntil(fn, tries) {
      for (var i = 0; i < (tries || 150); i++) {
        if (fn()) return true;
        await new Promise(function (r) { setTimeout(r, 20); });
      }
      return false;
    }

    // ---- 1. 预算单位：字符（UTF-16 码元），不是字节 ----
    // 这条曾经搞反过：按「1 字符 = 2 字节」折算，于是把 5,242,880 字符的配额
    // 当成了 10MB，据此设的预算全跟着错。下面第 8 节直接把配额量出来自校验。
    t('占用按字符数计', charsOf('abc'), 3);
    t('空值算 0', charsOf(null), 0);

    function mk(i, len) { return { id: 'x' + i, html: new Array(len + 1).join('x') }; }
    var three = [mk(1, 100), mk(2, 100), mk(3, 100)];
    t('预算 250 字符装得下 2 条（每条 100）', trimByBudget(three, 250, 10).length, 2);
    t('预算 400 字符装得下 3 条', trimByBudget(three, 400, 10).length, 3);
    t('无论多大都至少保住最新一份', trimByBudget([mk(1, 100000)], 10, 10).length, 1);
    t('条数上限仍然生效', trimByBudget([mk(1, 10), mk(2, 10), mk(3, 10)], 999999, 2).length, 2);

    // ---- 2. 紧急腾挪只动「可再生」的键 ----
    var hist = [];
    for (var i = 0; i < 12; i++) hist.push({ id: 'h' + i, html: '<p>历史 ' + i + '</p>', title: 't' + i, savedAt: Date.now() - i });
    setHistory(hist);
    var snaps = [];
    for (var j = 0; j < 8; j++) snaps.push({ id: 's' + j, html: '<p>快照 ' + j + '</p>', title: 's' + j, savedAt: Date.now() - j });
    setSnapshots(snaps);
    var libBefore = [{ id: 'L1', title: '我的文档', html: '<h1>知识库文档</h1>' }];
    setLibrary(libBefore);

    t('腾挪前历史 12 条', getHistory().length, 12);
    t('reclaimSpace 确实回收了空间', reclaimSpace(), true);
    t('历史被减半（12 → 6）', getHistory().length, 6);
    t('快照被减半（8 → 4）', getSnapshots().length, 4);
    t('知识库文档一条都没动', getLibrary().length, 1);
    t('知识库内容原样保留', getLibrary()[0].html, '<h1>知识库文档</h1>');

    // 只剩一条时必须停手，不能把用户的最后一份也删掉
    setHistory([{ id: 'only', html: '<p>仅存的一条</p>', title: 'only', savedAt: Date.now() }]);
    reclaimSpace();
    t('历史只剩 1 条时不会再删', getHistory().length, 1);

    // ---- 3. 「存入知识库」写盘失败不得假报成功 ----
    // 前置守卫：必须确认真的跑在 IndexedDB 上，否则这一组断言测的还是旧路径（空转）
    t('存储后端确实是 IndexedDB（否则本组断言没覆盖到新代码）', window.__folioStorage.mode(), 'idb');
    editor.innerHTML = '<h1>要存进知识库的内容</h1><p>正文</p>';
    document.getElementById('lib-save-title-input').value = '失败测试';
    document.getElementById('lib-save-modal').hidden = false;
    document.getElementById('toast').textContent = '';
    // 让写入必定失败：两条后端都堵上，避免只堵了 localStorage 却在 IDB 模式下空转
    var realSet = localStorage.setItem, realPut = window.idbPutMany;
    localStorage.setItem = function () { throw new Error('QuotaExceededError'); };
    window.idbPutMany = function () { return Promise.reject(new Error('QuotaExceededError')); };
    document.getElementById('lib-save-confirm').click();
    await waitUntil(function () { return /未能存入知识库/.test(document.getElementById('toast').textContent); }, 60);
    var toastText = document.getElementById('toast').textContent;
    localStorage.setItem = realSet;
    window.idbPutMany = realPut;

    t('写盘失败时不弹「已存入知识库」', /已存入知识库/.test(toastText), false);
    t('写盘失败时给出的是失败提示', /未能存入知识库/.test(toastText), true);
    t('写盘失败时弹窗不关（用户输入不丢）', document.getElementById('lib-save-modal').hidden, false);
    document.getElementById('lib-save-modal').hidden = true;
    t('知识库里确实没有这条（与提示一致）', getLibrary().length, 1);

    // ---- 4. 存储面板 ----
    // 裁剪按钮会 await confirmDialog；测试里直接让它恒真，免得去点确认框
    window.confirmDialog = function () { return Promise.resolve(true); };
    document.getElementById('history-modal').hidden = false;
    document.getElementById('history-storage').click();
    var body = document.getElementById('storage-body').innerHTML;
    t('存储面板已打开', document.getElementById('storage-modal').hidden, false);
    t('打开面板时先关掉历史弹窗（避免两层弹窗叠加）', document.getElementById('history-modal').hidden, true);
    t('面板列出了知识库这一项', /知识库/.test(body), true);
    t('面板标明了当前存储后端', /存储后端/.test(body), true);
    t('面板写明正文已存进 IndexedDB', /文档数据（IndexedDB）/.test(body), true);
    t('面板写明了 localStorage 的配额是按字符算的', /配额按<b>字符<\/b>算/.test(body), true);
    t('面板给出了实测的配额数值', /5,242,880/.test(body), true);
    t('面板说明了 API 密钥不进备份', /API 密钥不会写进备份/.test(body), true);
    // 面板必须把 5 个大键逐个列出来（少一个就说明某个键没被算进占用）
    t('面板列出了全部 5 个大键', (body.match(/class="sto-key"/g) || []).length >= 5, true);

    setHistory(hist.slice(0, 6));
    document.getElementById('storage-trim-hist').click();
    await new Promise(function (r) { setTimeout(r, 80); });
    t('历史不足 10 条时面板不动它', getHistory().length, 6);

    setHistory(hist);   // 12 条再试一次
    document.getElementById('storage-trim-hist').click();
    await waitUntil(function () { return getHistory().length === 10; }, 50);
    t('历史超过 10 条时裁到 10', getHistory().length, 10);
    document.getElementById('storage-close').click();
    t('面板可关闭', document.getElementById('storage-modal').hidden, true);

    // ---- 5. 备份导出：v4 补齐了哪些键 ----
    var captured = null;
    var realDownload = window.downloadBlob;
    window.downloadBlob = function (blob, name) { captured = { blob: blob, name: name }; };
    setZoom(1.5);
    exportBackup();
    window.downloadBlob = realDownload;
    t('导出文件名', captured && captured.name, 'folio备份.json');
    var json = captured ? JSON.parse(await captured.blob.text()) : null;
    t('备份版本号升到 4', json && json.version, 4);
    t('备份包含 activeDocId', json && typeof json.activeDocId, 'string');
    t('备份包含 zoom', json && json.zoom, 1.5);
    t('备份包含 splitPrefs', json && typeof (json.splitPrefs || {}), 'object');
    t('备份包含 pdfOpts', json && typeof (json.pdfOpts || {}), 'object');
    t('备份包含 selOff', json && Array.isArray(json.selOff), true);
    t('备份默认不含翻译 API 密钥（明文备份的安全默认）', json && ('translate' in json), false);

    // ---- 6. 备份导入：v4 的键要还原得回去 ----
    var backup = {
      app: 'folio', version: 4,
      docs: [{ id: 'dz1', html: '<h1>导入的标签</h1>', file: null, title: '导入的标签' }],
      activeDocId: 'dz1',
      history: [], library: [], categories: [], words: [], focus: [], snapshots: [],
      pdfOpts: { page: 'A3', margin: '20mm', font: '15px', line: '1.8' },
      splitPrefs: { mainId: 'dz1', sideId: null, ratio: 33 },
      selOff: ['foo.md'],
      zoom: 2
    };
    var input = document.getElementById('history-import-input');
    function feed(seed, obj) {
      var dt = new DataTransfer();
      dt.items.add(new File([JSON.stringify(obj)], seed, { type: 'application/json' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    feed('b.json', backup);
    // FileReader 是异步的：等到导入真的落地再断言，不要用固定 sleep 赌它跑完了
    var landed = await waitUntil(function () { return activeDocId === 'dz1'; });

    ta('导入后活动标签选中导入的那篇', landed ? activeDocId : activeDocId, 'dz1');
    ta('导入后纸面缩放还原', zoomLevel, 2);
    ta('导入后 PDF 纸张还原为 A3', document.getElementById('pdf-opt-page').value, 'A3');
    ta('导入后划词关闭记录还原', JSON.parse(localStorage.getItem('folio.selOff'))[0], 'foo.md');
    ta('导入后分屏记忆还原', JSON.parse(localStorage.getItem('folio.splitPrefs')).ratio, 33);
    ta('导入后编辑器显示的是导入的内容', /导入的标签/.test(editor.innerHTML), true);

    // v3 的旧备份没有这些键，导入时不能报错
    var legacy = { app: 'folio', version: 3, history: [], library: [], docs: [{ id: 'old1', html: '<p>旧</p>', title: '旧' }] };
    feed('old.json', legacy);
    await waitUntil(function () { return activeDocId === 'old1'; });
    ta('v3 旧备份仍可导入（缺的键跳过）', activeDocId, 'old1');

    // ---- 7. 核心诉求：超过 localStorage 5MB 上限的文档必须能存下 ----
    // 这是整次改造要解决的问题本身，直接量它，而不是只量周边。
    var huge = JSON.stringify({
      html: '<p>' + '很长的正文。'.repeat(1300000) + '</p>',
      title: '超大文档', savedAt: Date.now()
    });
    out.push('INFO 超大草稿 = ' + huge.length.toLocaleString('en-US') + ' 字符（localStorage 配额约 ' +
             LS_QUOTA_CHARS.toLocaleString('en-US') + '）');
    t('这份文档确实超过了 localStorage 的整个配额', huge.length > LS_QUOTA_CHARS, true);
    var okBig = await storeSetDurable('folio.draft', huge);
    t('超过整份配额的文档写入成功（localStorage 时代这里必然失败）', okBig, true);

    // 真的落到盘上、而不只是躺在内存镜像里：重新从 IDB 独立读一遍
    var readBack = await new Promise(function (res) {
      try {
        var rq = indexedDB.open('folio', 1);
        rq.onerror = function () { res(null); };
        rq.onsuccess = function (e) {
          var g = e.target.result.transaction('kv', 'readonly').objectStore('kv').get('folio.draft');
          g.onsuccess = function () { res(g.result); };
          g.onerror = function () { res(null); };
        };
      } catch (err) { res(null); }
    });
    t('超大文档真的落到了 IndexedDB 里（不是只在内存）',
      readBack !== null && readBack.length === huge.length, true);
    t('落盘内容首尾都对得上',
      readBack !== null && readBack.slice(0, 40) === huge.slice(0, 40) && readBack.slice(-40) === huge.slice(-40), true);
    // 清掉，别让这份超大文档影响后面的用例
    storeSetDurable('folio.draft', 'null');
    safeRemove('folio.draft');

    // ---- 8. 自校验：把 localStorage 的真实配额量出来，验证代码里的常量没写歪 ----
    // 这一节的唯一目的就是防止「单位搞错」再次发生：曾经按「1 字符 = 2 字节」折算，
    // 得出「配额是 10MB」的错误结论，据此设的预算全跟着错，还据此写了一版错误的结论。
    // 放在最后做，因为它会把 localStorage 填满；全程用裸 setItem，不走 safeSet，
    // 免得触发 reclaimSpace 把历史/快照清掉。
    var CAP = (function () {
      var CH = 250000, chunk = new Array(CH + 1).join('x'), i, n = 0;
      try { for (; n < 40; n++) localStorage.setItem('__qp' + n, chunk); } catch (e) {}
      var lo = 0, hi = CH;
      while (lo < hi) {
        var mid = Math.ceil((lo + hi) / 2);
        try { localStorage.setItem('__qp' + n, new Array(mid + 1).join('x')); lo = mid; }
        catch (e) { hi = mid - 1; }
      }
      var cap = n * CH + lo;
      for (i = 0; i <= n; i++) { try { localStorage.removeItem('__qp' + i); } catch (e) {} }
      return cap;
    })();
    out.push('INFO 实测 localStorage 配额 = ' + CAP.toLocaleString('en-US') + ' 字符');
    t('代码里的配额常量与实测相符（误差 < 1%）', Math.abs(CAP - LS_QUOTA_CHARS) / CAP < 0.01, true);
    t('配额确实按字符计 —— 若按字节算会得出约 10MB，那是错的', CAP < 6 * 1024 * 1024, true);
    t('探针清干净了（没把 localStorage 占着）',
      (function () { try { for (var k = 0; k < localStorage.length; k++) if (String(localStorage.key(k)).indexOf('__qp') === 0) return false; return true; } catch (e) { return false; } })(), true);

    emitResults();
  }, 700);
});
