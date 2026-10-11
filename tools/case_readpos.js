// 阅读位置记忆自检：关掉再打开，要回到上次读到的地方。
//
// 关键设计点（也是这个用例重点保护的东西）：存的是**由内容推出的锚点**，
// 不是导航窗格那套 WeakMap 锚点 —— 后者按元素身份编号，刷新页面后全变，
// 存下来毫无意义。所以用例里专门模拟了「刷新」（重建 DOM）来验证。
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(async function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    function near(a, b, tol) { return Math.abs(a - b) <= (tol || 3); }
    var emitted = false;
    function emitResults() {
      if (emitted) return;
      emitted = true;
      var pre = document.createElement('pre');
      pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
      document.body.appendChild(pre);
    }
    setTimeout(emitResults, 20000);
    try {
      await window.__folioReady;
      var stage = document.querySelector('.stage');
      function stageTop() { return stage.getBoundingClientRect().top; }
      function relOf(el) { return el.getBoundingClientRect().top - stageTop(); }
      // 测试里直接设滚动，用 restoringReadPos 压掉「别把程序化滚动当用户滚动」的防抖
      function jumpTo(top) {
        restoringReadPos = true;
        stage.scrollTo({ top: top, behavior: 'auto' });
        restoringReadPos = false;
      }
      // 当前「读到哪一节」：视口上方最近的那个标题（与 captureReadPos 同一套口径）
      function topSectionText() {
        var hs = editor.querySelectorAll('h1,h2,h3,h4,h5,h6'), line = stageTop() + 8, cur = '';
        for (var i = 0; i < hs.length; i++) {
          if (hs[i].getBoundingClientRect().top > line) break;
          cur = hs[i].textContent.replace(/\s+/g, ' ').trim();
        }
        return cur;
      }
      function longDoc(tag) {
        var h = '';
        for (var i = 1; i <= 12; i++) h += '<h2>第 ' + i + ' 节' + tag + '</h2><p>' + '正文内容。'.repeat(80) + '</p>';
        return h;
      }

      // ---- 1. 捕获：按文档 id 存下来，且是锚点式 ----
      editor.innerHTML = longDoc('甲');
      refreshNav(true);
      var docA = activeDocId;
      var hs = editor.querySelectorAll('h2');
      var target = hs[6];
      // 让目标标题落在视口**上方** 6px：这样它才在阅读线（stageTop+8）之内，
      // 才是被锚住的那一节。放在下方的话锚到的是上一节，后面比的就不是同一节了。
      jumpTo(target.getBoundingClientRect().top - stageTop() + stage.scrollTop + 6);
      var relBefore = relOf(target);
      captureAndSaveReadPos();

      var map = loadReadPos();
      t('按当前文档 id 记下了位置', !!map[docA], true);
      t('存的是锚点', typeof map[docA].a === 'string' && map[docA].a.length > 0, true);
      t('锚点由内容推出（级别|同名次序|文本）',
        map[docA].a, 'h2|0|' + target.textContent.replace(/\s+/g, ' ').trim());
      t('锚住的确实是视口上那一节', map[docA].a, stableAnchorOf(target));
      t('同时记了相对视口的偏移', typeof map[docA].d === 'number', true);
      t('也留了比例兜底', typeof map[docA].r === 'number', true);

      // ---- 2. 模拟「刷新后重新打开」：整篇 DOM 重建 ----
      // 重建后元素身份全变 —— 若锚点用的是内存编号，这里必然找不到。这一条就是
      // 用来钉死「锚点必须由内容推出」这个设计的。
      editor.innerHTML = longDoc('甲');
      refreshNav(true);
      t('重建后标题是新元素（元素身份已变）', editor.querySelectorAll('h2')[6] !== target, true);
      jumpTo(0);
      t('重建后能从锚点找回位置', restoreReadPos(docA, false), true);
      t('位置恢复到原处（±3px）', near(relOf(editor.querySelectorAll('h2')[6]), relBefore), true);

      // ---- 3. 上方插入内容也不该漂 ----
      // 重新打开时上方可能因为图片/公式渲染而变高；锚点式定位对此免疫，裸像素不免疫。
      editor.innerHTML = '<p>' + '上方新增的长段落。'.repeat(400) + '</p>' + longDoc('甲');
      refreshNav(true);
      jumpTo(0);
      restoreReadPos(docA, false);
      t('上方插入大段内容后仍锚在同一节（±3px）', near(relOf(editor.querySelectorAll('h2')[6]), relBefore), true);

      // ---- 4. 换纸面缩放也照样对得上 ----
      // 注意比的是「被锚住的那一节」，不是随便某个后续标题：换了缩放，纸宽从 840
      // 变成 1260，正文折行数变了，后面标题的位置本来就会跟着变 —— 那不是 bug。
      // 而且是同一节这点才是用户真正在意的。
      setZoom(1.5);
      jumpTo(0);
      restoreReadPos(docA, false);
      t('150% 下仍在同一节（视口上方那一节没变）', topSectionText(), target.textContent.replace(/\s+/g, ' ').trim());
      // 必须重新取元素：前面重建过两次 DOM，section 1 里的那个 target 早已脱离文档，
      // 它的 getBoundingClientRect() 全是 0（曾经因此得到一个假的 -158px）
      t('150% 下锚点标题就在视口顶部附近', Math.abs(relOf(editor.querySelectorAll('h2')[6])) <= 20, true);
      out.push('INFO 150% 下锚点标题相对视口 = ' + Math.round(relOf(editor.querySelectorAll('h2')[6])) +
               'px（期望 ≈ ' + Math.round(map[docA].d * 1.5) + '）');
      setZoom(1);
      jumpTo(0);
      restoreReadPos(docA, false);
      t('回到 100% 后仍在同一节', topSectionText(), target.textContent.replace(/\s+/g, ' ').trim());

      // ---- 5. 切标签：离开时存、回来时恢复 ----
      jumpTo(0);
      restoreReadPos(docA, false);
      var posInA = stage.scrollTop;
      t('在甲文档里滚到了一个非零位置', posInA > 100, true);

      openNewDoc(longDoc('乙'), null);      // 新开一篇，会把当前标签切走
      var docB = activeDocId;
      t('新文档没有历史位置，不强行滚动', restoreReadPos(docB, false), false);
      jumpTo(0);
      t('切回甲文档（走 loadDoc → 自动恢复）', (function () {
        loadDoc(docById(docA));
        return near(stage.scrollTop, posInA, 20);
      })(), true);
      out.push('INFO 甲文档恢复后 scrollTop=' + Math.round(stage.scrollTop) + '（离开时 ' + Math.round(posInA) + '）');

      // ---- 6. 空文档不记位置 ----
      editor.innerHTML = '';
      updateStatus();
      t('空文档不记阅读位置', captureReadPos(), null);

      // ---- 7. 位置表不会无限增长 ----
      var big = {};
      for (var i = 0; i < READ_POS_MAX + 25; i++) big['doc' + i] = { a: 'h2|0|x', d: 0, r: 0, s: 0, t: i };
      saveReadPosMap(big);
      t('超出上限后按最近使用淘汰', Object.keys(loadReadPos()).length, READ_POS_MAX);
      t('留下的是最近的那些', !!loadReadPos()['doc' + (READ_POS_MAX + 24)], true);
      t('最旧的已被淘汰', loadReadPos().doc0, undefined);

      // ---- 8. 恢复被限制在可滚动范围内 ----
      localStorage.removeItem('folio.readPos');
      editor.innerHTML = longDoc('丙');
      refreshNav(true);
      var m2 = {}; m2[activeDocId] = { a: '', d: 0, r: 5, s: 0, t: Date.now() };   // 比例故意越界
      safeSet('folio.readPos', JSON.stringify(m2));
      restoreReadPos(activeDocId, false);
      t('越界比例被夹到可滚动上限', stage.scrollTop <= Math.max(0, stage.scrollHeight - stage.clientHeight) + 1, true);
    } catch (e) {
      out.push('FAIL 用例抛错 | ' + (e && e.stack ? e.stack : e));
    }
    emitResults();
  }, 400);
});
