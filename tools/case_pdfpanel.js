try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((got === want ? 'PASS ' : 'FAIL ') + name + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    editor.innerHTML = '<h1>标题</h1><p>正文</p>';
    document.getElementById('btn-pdf').click();
    t('未美化时可选', document.getElementById('pdf-opt-font').disabled, false);
    document.getElementById('pdf-cancel').click();
    beautifyDoc('gov');
    document.getElementById('btn-pdf').click();
    t('美化后置灰', document.getElementById('pdf-opt-font').disabled, true);
    t('提示文案', document.querySelector('.pdf-opt-tip').textContent.indexOf('公文') !== -1, true);
    document.getElementById('pdf-download').click();   // 触发打印（无头下同时验证界面不泄漏）
    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 600);
});
