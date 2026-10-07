// 校验「离屏 iframe 打印」的文档组装与可见性硬化 —— 跨 Chrome / Edge 通用。
// 无法在此验证 iframe 打印本身（无头 --print-to-pdf 只打主文档），
// 这里验证的是「被打的那份文档」是否被正确构造与保护。
// 注意：无头环境下 requestAnimationFrame 不触发，一律用 setTimeout 调度。
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    try {
      editor.innerHTML = '<h1>IFRAME_BODY_MARK</h1><p>正文段落</p>';
      var sel = document.getElementById('pdf-opt-page');
      sel.value = 'A3';
      sel.dispatchEvent(new Event('change', { bubbles: true }));

      var html = buildPrintDocHtml('测试文档名');
      t('含正文', html.indexOf('IFRAME_BODY_MARK') !== -1, true);
      t('含纸张A3', /@page\{\s*size:A3/.test(html), true);
      t('含边距参数', /margin:20mm/.test(html), true);
      t('含硬化规则', html.indexOf('body *{ visibility:hidden !important; }') !== -1, true);
      t('含base（相对路径可解析）', html.indexOf('<base href=') !== -1, true);
      t('含样式表链接', html.indexOf('katex/katex.min.css') !== -1, true);
      t('含分页规则', html.indexOf('break-after:avoid-page') !== -1, true);
      t('含文档标题', html.indexOf('<title>测试文档名</title>') !== -1, true);
      t('含正文字号参数', /font-size:12pt !important/.test(html), true);

      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:400px;height:300px;border:0;opacity:0;pointer-events:none;';
      document.body.appendChild(f);
      var d = f.contentDocument;
      d.open(); d.write(html); d.close();
      // 在 .print-root 之外注入一个「类扩展」元素（模拟扩展也注入到 iframe 的情况）
      var ext = d.createElement('div');
      ext.id = 'zz-ext';
      ext.setAttribute('style', 'position:fixed;top:10px;right:10px;z-index:2147483647;background:#fff');
      ext.textContent = 'EXT_IN_IFRAME';
      d.body.appendChild(ext);
    } catch (e) { out.push('THROWN ' + e.message); }

    setTimeout(function () {
      try {
        var dd = document.querySelector('iframe').contentDocument;
        var head = dd.querySelector('.print-root .editor h1');
        var extEl = dd.getElementById('zz-ext');
        t('正文标题可见', head ? getComputedStyle(head).visibility : '(缺)', 'visible');
        t('正文容器可见', getComputedStyle(dd.querySelector('.print-root')).visibility, 'visible');
        t('注入元素被隐', extEl ? getComputedStyle(extEl).visibility : '(缺)', 'hidden');
        // 硬化不应误伤正文：正文容器必须仍可见（对照）
        t('硬化未误伤正文', getComputedStyle(dd.querySelector('.print-root .editor')).visibility, 'visible');
        // 关键：iframe 是 about:blank 且运行在 file:// 下，外链样式表必须真的加载成功，
        // 否则 KaTeX 公式与代码高亮会没有样式（link 标签存在 ≠ 表加载成功）
        var links = Array.prototype.slice.call(dd.querySelectorAll('link[rel="stylesheet"]'));
        var loaded = links.filter(function (l) { return !!l.sheet; }).length;
        t('外链样式表全部加载', loaded + '/' + links.length, links.length + '/' + links.length);
        t('样式表数量不为零', links.length > 0, true);
        t('内联样式表可用', dd.styleSheets.length > links.length, true);
      } catch (e) { out.push('THROWN2 ' + e.message); }
      var pre = document.createElement('pre');
      pre.id = 'zz-results';
      pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
      document.body.appendChild(pre);
    }, 500);
  }, 600);
});
