try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((got === want ? 'PASS ' : 'FAIL ') + name + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    // 模拟粘贴导入
    document.getElementById('btn-paste').click();
    document.getElementById('paste-input').value = '## 标题\n\n\n- 条目  \n';
    document.getElementById('paste-confirm').click();
    t('询问条出现', document.getElementById('beautify-bar').hidden, false);
    t('文案为询问', document.getElementById('bz-msg').textContent.indexOf('要一键美化') !== -1, true);
    // 点「公文」
    var govBtn = Array.prototype.find.call(document.querySelectorAll('#bz-acts button'), function (b) { return b.textContent === '公文'; });
    govBtn.click();
    t('已套用', /方正小标宋/.test(editor.innerHTML), true);
    t('文案为已美化', document.getElementById('bz-msg').textContent.indexOf('已美化') !== -1, true);
    // 撤销
    var undoBtn = Array.prototype.find.call(document.querySelectorAll('#bz-acts button'), function (b) { return b.textContent === '撤销'; });
    undoBtn.click();
    t('撤销后无方正小标宋', /方正小标宋/.test(editor.innerHTML), false);
    t('撤销后浮条隐藏', document.getElementById('beautify-bar').hidden, true);

    // === 回归 1：询问条不得被「别的文档遗留的撤销记录」抑制 ===
    // 先在当前文档上造出一条 beautifyUndo（docId = 当前文档），再粘贴导入新文档。
    beautifyDoc('clean');
    document.getElementById('btn-paste').click();
    document.getElementById('paste-input').value = '第二个文档\n\n正文二';
    document.getElementById('paste-confirm').click();
    t('遗留撤销记录不抑制询问条', document.getElementById('beautify-bar').hidden, false);
    t('遗留撤销记录下文案仍为询问', document.getElementById('bz-msg').textContent.indexOf('要一键美化') !== -1, true);

    // === 回归 2：已美化状态下「以后自动套用」复选框必须隐藏 ===
    beautifyDoc('clean');
    var wrap = document.getElementById('bz-auto-wrap');
    t('已美化态复选框 hidden', wrap.hidden, true);
    t('已美化态复选框 display:none', getComputedStyle(wrap).display, 'none');

    // === 回归 3：编辑后撤销入口必须失效（否则撤销会覆盖用户输入）===
    editor.innerHTML += '<p>用户输入</p>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    t('编辑后浮条隐藏', document.getElementById('beautify-bar').hidden, true);

    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 600);
});
