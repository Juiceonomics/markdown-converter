try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((got === want ? 'PASS ' : 'FAIL ') + name + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    editor.innerHTML = '<h1>标题</h1><p>正文</p>';
    var before = editor.innerHTML;
    beautifyDoc('gov');
    t('已套用', /方正小标宋/.test(editor.innerHTML), true);
    t('文档标记', docById(activeDocId).beautifyPreset, 'gov');
    beautifyUndoNow();
    t('撤销后一致', editor.innerHTML === before, true);
    t('撤销后无标记', docById(activeDocId).beautifyPreset, undefined);
    // 源码模式下套用也必须真正生效（不切回富文本会被 saveDocsState 覆盖掉）
    setMode('source');
    editor.innerHTML = '<h1>源码模式</h1><p>正文</p>';
    source.value = '# 源码模式\n\n正文';
    beautifyDoc('gov');
    t('源码模式下已套用', /方正小标宋/.test(editor.innerHTML), true);
    t('源码模式下已离开源码视图', mode, 'wysiwyg');
    t('源码模式下 d.html 未被覆盖', /方正小标宋/.test(docById(activeDocId).html), true);
    beautifyUndoNow();
    // 回归：换方案后撤销必须回到「最初原始」，而不是回到上一个方案的结果
    editor.innerHTML = '<h1>原始标题</h1><p>原始正文</p>';
    var originalHtml = editor.innerHTML;
    beautifyDoc('clean');
    beautifyDoc('gov');            // 换方案，不得覆盖最初原始
    beautifyUndoNow();
    t('换方案后撤销回到最初原始', editor.innerHTML === originalHtml, true);
    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 500);
});
