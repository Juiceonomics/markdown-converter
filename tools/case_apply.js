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
    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 500);
});
