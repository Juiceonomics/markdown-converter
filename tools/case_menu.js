try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((got === want ? 'PASS ' : 'FAIL ') + name + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    editor.innerHTML = '<h2>标题</h2><p>正文</p>';
    // 通过菜单套用「论文」
    document.querySelector('#beautify-dd button[data-bz="paper"]').click();
    t('已套用论文', /黑体/.test(editor.innerHTML), true);
    t('配置已记忆', loadBeautifyCfg().preset, 'paper');
    // 自动套用开关
    document.querySelector('#beautify-dd button[data-bz-auto]').click();
    t('auto 开', loadBeautifyCfg().auto, true);
    t('菜单文案', document.getElementById('bz-auto-toggle').textContent.indexOf('开') !== -1, true);
    // 自动模式下粘贴不再询问
    document.getElementById('btn-paste').click();
    document.getElementById('paste-input').value = '# 新文\n\n正文';
    document.getElementById('paste-confirm').click();
    t('自动套用生效', /黑体/.test(editor.innerHTML), true);
    t('状态条可撤销', document.getElementById('bz-msg').textContent.indexOf('已美化') !== -1, true);
    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 600);
});
