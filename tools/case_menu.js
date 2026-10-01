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
    t('菜单文案', document.getElementById('bz-auto-toggle').textContent, '粘贴导入时自动套用：开');
    t('菜单已收起', document.getElementById('beautify-dd').hidden, true);
    // 自动模式下粘贴不再询问
    document.getElementById('btn-paste').click();
    document.getElementById('paste-input').value = '# 新文\n\n正文';
    document.getElementById('paste-confirm').click();
    t('自动套用生效', /黑体/.test(editor.innerHTML), true);
    t('状态条可撤销', document.getElementById('bz-msg').textContent.indexOf('已美化') !== -1, true);

    // 回归：菜单开关与浮条复选框必须双向同步（共用同一个 cfg.auto）。
    // 注意：复选框只在「询问态」被 refreshBeautifyBar 同步，所以必须先关掉 auto
    // 让下次粘贴进入询问态 —— 否则粘贴会走自动套用、落在「已美化态」，测不到该同步。
    document.querySelector('#beautify-dd button[data-bz-auto]').click(); // auto: 开 -> 关
    t('auto 已关', loadBeautifyCfg().auto, false);
    document.getElementById('btn-paste').click();
    document.getElementById('paste-input').value = '# 同步测试\n\n正文';
    document.getElementById('paste-confirm').click();
    t('处于询问态', document.getElementById('beautify-bar').hidden, false);
    // 方向一：菜单开 → 浮条复选框应被勾上
    document.querySelector('#beautify-dd button[data-bz-auto]').click();
    t('菜单开→浮条同步', document.getElementById('bz-auto').checked, true);
    // 方向二：浮条取消 → 菜单文案应为「关」
    var cb = document.getElementById('bz-auto');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    t('浮条关→菜单同步', document.getElementById('bz-auto-toggle').textContent, '粘贴导入时自动套用：关');

    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 600);
});
