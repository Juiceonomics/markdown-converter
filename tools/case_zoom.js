// 纸面自主缩放：只缩放主编辑器那张白纸，界面外壳不受影响，快捷键 / 滚轮 / 持久化 / 导航联动都要对。
//
// 关键测量说明（踩过的坑，别再改回去）：
//   · 必须量 getBoundingClientRect().width。getComputedStyle(el).fontSize 在 zoom 下
//     仍返回「未缩放的 16px」—— 拿它当断言会永远通过（空转断言）。
//   · 期望值不能写死 840×z：纸的实际渲染宽度是 min(840 × z, 舞台内容宽)，
//     而舞台内容宽会随纵向滚动条出现而变小，所以必须在下完 zoom 之后再读 clientWidth。
//   · 默认无头窗口 800x600 下舞台内容宽只有约 240px，纸宽在任何档位都是 240 ——
//     那样整套宽度断言都是空转。tools/headless_check.py 固定了 --window-size=1440,900，
//     本用例开头还有一条前置守卫断言窗口确实够宽。
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    function near(a, b, tol) { return Math.abs(a - b) <= (tol || 1.5); }

    var stage = document.querySelector('.stage');
    var zoomCtl = document.getElementById('zoom-ctl');
    var zoomReset = document.getElementById('zoom-reset');
    var navPane = document.getElementById('nav-pane');
    var toolbar = document.getElementById('toolbar');

    function stageW() {
      var cs = getComputedStyle(stage);
      return stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    }
    // getBoundingClientRect 会强制同步布局，所以下完 zoom 直接量即可
    function paperW() { return editor.getBoundingClientRect().width; }
    function expectW(z) { return Math.min(840 * z, stageW()); }

    // ---- 0. 前置守卫：窗口不够宽的话下面所有宽度断言都会退化成同一个数 ----
    // 舞台内容宽必须 ≥ 840×1.5，否则 100%/150% 都被 max-width 截成同一个值，
    // 「放大让纸变宽」这条断言就变成永远通过的空转（1440x900 窗口实测正是如此：839px）。
    t('测试窗口足够宽，150% 档不被截断（否则宽度断言空转）', stageW() >= 840 * 1.5, true);
    out.push('INFO 舞台内容宽 = ' + stageW().toFixed(1) + 'px，纸基准宽 = 840px');

    // ---- 1. 纸宽 = min(840 × z, 舞台内容宽) ----
    [1, 0.5, 1.5, 2].forEach(function (z) {
      setZoom(z);
      var got = paperW(), want = expectW(z);
      out.push((near(got, want) ? 'PASS ' : 'FAIL ') +
               '纸宽 = min(840×' + z + ', 舞台内容宽)' +
               ' | got=' + got.toFixed(1) + ' want=' + want.toFixed(1));
    });
    // 核心主张单独钉死一次：放大确实让纸变宽（不是靠上面那条公式自证）
    setZoom(1); var w100 = paperW();
    setZoom(1.5); var w150 = paperW();
    t('150% 的纸确实比 100% 宽', w150 > w100 + 100, true);
    out.push('INFO 纸宽 100%=' + w100.toFixed(1) + 'px → 150%=' + w150.toFixed(1) + 'px');

    // ---- 2. 缩放的落点：主编辑器 + 源码纸面，不含分屏 ----
    setZoom(1.5);
    t('主编辑器已缩放', parseFloat(getComputedStyle(editor).zoom), 1.5);
    t('源码模式的纸面同步缩放', parseFloat(getComputedStyle(source).zoom), 1.5);
    t('分屏编辑器不缩放', parseFloat(getComputedStyle(document.getElementById('split-editor1')).zoom), 1);

    // ---- 3. 只动纸，不动界面外壳（这正是本功能存在的理由）----
    setZoom(1);
    var navW1 = navPane.getBoundingClientRect().width;
    var barH1 = toolbar.getBoundingClientRect().height;
    var statusH1 = document.querySelector('footer.statusbar').getBoundingClientRect().height;
    setZoom(2);
    t('放大 200% 后导航窗格宽度不变', near(navPane.getBoundingClientRect().width, navW1, 0.6), true);
    t('放大 200% 后工具栏高度不变', near(toolbar.getBoundingClientRect().height, barH1, 0.6), true);
    t('放大 200% 后状态栏高度不变', near(document.querySelector('footer.statusbar').getBoundingClientRect().height, statusH1, 0.6), true);
    out.push('INFO 200% 时纸宽=' + paperW().toFixed(1) + 'px，导航窗格=' + navW1.toFixed(1) + 'px');

    // ---- 4. 按钮 ----
    setZoom(1);
    document.getElementById('zoom-in').click();
    t('「+」放大一档', zoomReset.textContent, '110%');
    t('「+」后纸确实变大', paperW() > expectW(1) - 0.6, true);
    document.getElementById('zoom-out').click();
    t('「-」缩小一档', zoomReset.textContent, '100%');
    document.getElementById('zoom-in').click();
    zoomReset.click();
    t('中间读数按钮精确回到 100%', zoomLevel, 1);
    t('读数同步显示 100%', zoomReset.textContent, '100%');

    // ---- 5. 上下限夹取 ----
    for (var i = 0; i < 40; i++) document.getElementById('zoom-in').click();
    t('连续放大的上限是 300%', zoomLevel, 3);
    for (var j = 0; j < 60; j++) document.getElementById('zoom-out').click();
    t('连续缩小的下限是 50%', zoomLevel, 0.5);

    // ---- 6. 持久化 + 脏值回落 ----
    setZoom(1.5);
    t('缩放值已写入 localStorage', JSON.parse(localStorage.getItem('folio.zoom') || 'null'), 1.5);
    t('loadZoomCfg 读得回', loadZoomCfg(), 1.5);
    localStorage.setItem('folio.zoom', '"abc"');
    t('脏值 "abc" 回落 100%', loadZoomCfg(), 1);
    localStorage.setItem('folio.zoom', '99');
    t('超范围 99 回落 100%', loadZoomCfg(), 1);
    localStorage.setItem('folio.zoom', 'not json');
    t('非 JSON 回落 100%', loadZoomCfg(), 1);
    setZoom(1);

    // 启动恢复路径：读存储 → 写进样式 → 纸真的变大。
    // 无头环境里无法真的刷新页面（注入点在应用脚本之后），所以直接把启动时那两行跑一遍；
    // 只断言 loadZoomCfg 的返回值会漏掉「读到了但没应用」这类断链。
    localStorage.setItem('folio.zoom', '1.5');
    zoomLevel = loadZoomCfg();
    applyZoom();
    t('按存储值恢复后纸确实被放大', near(paperW(), expectW(1.5), 1.5), true);
    t('按存储值恢复后读数正确', zoomReset.textContent, '150%');
    setZoom(1);

    // ---- 7. 快捷键（必须 preventDefault，否则浏览器整页缩放会同时触发）----
    function key(k) {
      var ev = new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(ev);
      return ev.defaultPrevented;
    }
    setZoom(1);
    var pPlus = key('=');
    t('Ctrl+= 放大一档', zoomReset.textContent, '110%');
    t('Ctrl+= 已阻止浏览器整页缩放', pPlus, true);
    var pMinus = key('-');
    t('Ctrl+- 缩小一档', zoomReset.textContent, '100%');
    t('Ctrl+- 已阻止浏览器整页缩放', pMinus, true);
    key('='); key('=');
    var pZero = key('0');
    t('Ctrl+0 回到 100%', zoomReset.textContent, '100%');
    t('Ctrl+0 已阻止浏览器整页缩放', pZero, true);

    // ---- 8. Ctrl + 滚轮 ----
    function wheel(dy, ctrl) {
      var ev = new WheelEvent('wheel', { deltaY: dy, ctrlKey: ctrl, bubbles: true, cancelable: true });
      stage.dispatchEvent(ev);
      return ev.defaultPrevented;
    }
    setZoom(1);
    var wUp = wheel(-100, true);
    t('Ctrl+上滚放大', zoomReset.textContent, '110%');
    t('Ctrl+滚轮已阻止浏览器整页缩放', wUp, true);
    wheel(100, true);
    t('Ctrl+下滚缩小', zoomReset.textContent, '100%');
    var wPlain = wheel(-100, false);
    t('不带 Ctrl 的滚轮不被拦截（普通滚动照常）', wPlain, false);
    t('不带 Ctrl 的滚轮不改变缩放', zoomLevel, 1);

    // 导航窗格上方的 Ctrl+滚轮也要管：漏掉的话同一视图里会掉回浏览器整页缩放
    var navEv = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    navPane.dispatchEvent(navEv);
    t('导航窗格上的 Ctrl+滚轮同样缩放纸面', zoomReset.textContent, '110%');
    t('导航窗格上的 Ctrl+滚轮已被拦截', navEv.defaultPrevented, true);

    // ---- 8b. 源码模式的纸面也必须跟随 ----
    // .source 同样是 .stage 的 flex 子项，但用的是 flex:1 而不是 .editor 的 flex-shrink:0，
    // 宽度解析路径不同，单独验一次（只验 computedStyle 的 zoom 会漏掉布局问题）
    setZoom(1.5);
    setMode('source');
    var srcW = source.getBoundingClientRect().width;
    out.push('INFO 源码纸面宽 = ' + srcW.toFixed(1) + 'px，期望 ' + expectW(1.5).toFixed(1) + 'px');
    t('源码模式下纸面宽度同样 = min(840×1.5, 舞台内容宽)', near(srcW, expectW(1.5), 1.5), true);
    setMode('wysiwyg');
    setZoom(1);

    // ---- 9. 控件只在编辑器视图出现（状态栏在所有视图都常驻）----
    setView('zip');
    t('非编辑器视图隐藏缩放控件', zoomCtl.hidden, true);
    setView('editor');
    t('回到编辑器视图后恢复', zoomCtl.hidden, false);

    // ---- 10. 缩放后导航定位仍然准确 ----
    // zoom 参与布局（不像 transform 只影响绘制），但滚动定位是二分/算术实测量出来的，
    // 这是 zoom 与既有导航逻辑唯一的耦合点 —— 必须实测，不能靠推理。
    // 章节数给足：目标章节下方要有大量内容，否则跳转会被滚动上限截断，
    // 断言测的就变成「内容高度」而不是缩放（RED 自证时实测到过这个假失败）
    var html = '';
    for (var k2 = 1; k2 <= 10; k2++) {
      html += '<h2>章节 ' + k2 + '</h2><p>' + '正文内容。'.repeat(60) + '</p>';
    }
    editor.innerHTML = html;
    setZoom(1.5);
    refreshNav(true);
    var target = editor.querySelectorAll('h2')[4];   // 第 5 节，足够靠下
    scrollEditorToHeading(target, false);
    var delta = target.getBoundingClientRect().top - stage.getBoundingClientRect().top;
    var maxScroll = stage.scrollHeight - stage.clientHeight;
    out.push('INFO 导航跳转后 scrollTop=' + stage.scrollTop.toFixed(1) +
             ' 可滚动上限=' + maxScroll.toFixed(1) +
             '（未触底才能证明跳转真的发生了）');
    // 先钉住前提：没被滚到底部卡住，否则「落位 +24」这条断言测的就不是缩放而是内容高度
    t('跳转未被滚动上限截断（否则下一条断言无意义）',
      stage.scrollTop > 0 && stage.scrollTop < maxScroll - 2, true);
    // scrollEditorToHeading 把目标对齐到舞台顶部下方 24px
    t('150% 缩放下导航跳转仍精确落位（顶部 +24px）', near(delta, 24, 3) ? 'ok' : delta.toFixed(1), 'ok');

    setZoom(1);
    editor.innerHTML = '<h1>纸面缩放自检</h1>';

    var preOut = document.createElement('pre');
    preOut.id = 'zz-results';
    preOut.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(preOut);
  }, 700);
});
