// PDF 导出面板与打印准备的自检。
// 注意：无头环境下 window.print() 不产出任何东西，所以「打印」一律打桩，
// 并手动派发 beforeprint / afterprint（浏览器只在真实打印时才会发出它们）。
// 曾经这里只有一句「点下载」的注释、没有任何断言 —— 看似在测打印，实际什么都没测。
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    var printCalls = 0;
    var realPrint = window.print;
    window.print = function () { printCalls++; };

    // ---- 面板与美化的联动 ----
    editor.innerHTML = '<h1>标题</h1><p>正文</p>';
    document.getElementById('btn-pdf').click();
    t('未美化时字号可选', document.getElementById('pdf-opt-font').disabled, false);
    document.getElementById('pdf-cancel').click();
    beautifyDoc('gov');
    document.getElementById('btn-pdf').click();
    t('美化后字号置灰', document.getElementById('pdf-opt-font').disabled, true);
    t('提示文案含方案名', document.querySelector('.pdf-opt-tip').textContent.indexOf('公文') !== -1, true);

    // ---- 下载按钮：必须真的触发打印 ----
    var sel = document.getElementById('pdf-opt-page');
    sel.value = 'A3';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('pdf-download').click();
    t('点下载触发了打印', printCalls, 1);
    t('弹窗已关闭', document.getElementById('pdf-modal').hidden, true);

    // ---- beforeprint：打印前的准备必须做全 ----
    window.dispatchEvent(new Event('beforeprint'));
    var st = document.getElementById('pdf-print-style');
    t('注入了打印样式', !!st, true);
    var css = st ? st.textContent : '';
    t('样式含纸张 A3', /size:A3/.test(css), true);
    t('样式含边距', /margin:20mm/.test(css), true);
    t('样式含字号', /font-size:12pt !important/.test(css), true);
    t('样式只作用于 .workspace .editor', /\.workspace \.editor\{/.test(css), true);
    t('标题为文档名', document.title, '标题');

    // ---- afterprint：必须还原标题、清理注入的样式 ----
    window.dispatchEvent(new Event('afterprint'));
    t('标题已还原', document.title !== '标题', true);
    t('注入的样式已清理', document.getElementById('pdf-print-style'), null);

    // ---- 源码模式：Ctrl+P 前必须切回富文本，否则打印的是陈旧/空的 .editor ----
    setMode('source');
    source.value = '# 源码标题\n\n源码模式下的正文内容';
    t('已进入源码模式', mode, 'source');
    window.dispatchEvent(new Event('beforeprint'));
    t('源码模式下已切回富文本', mode, 'wysiwyg');
    t('源码内容已同步进编辑器', editor.innerHTML.indexOf('源码模式下的正文内容') !== -1, true);
    window.dispatchEvent(new Event('afterprint'));
    t('源码模式后标题也还原', document.title !== '源码标题', true);

    window.print = realPrint;
    var pre = document.createElement('pre');
    pre.id = 'zz-results';
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 600);
});
