// 清空可撤销 / 清空前留档 / 导入即留档 / 长内容换行 —— 四项自检。
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }

    // ---- ① 长算式不撑破纸面 ----
    // 实测：长文本 / 宽表格 / 宽图片 / 长代码行本来就不会溢出；唯一会溢出的是
    // KaTeX 显示公式（无法折行）。测量用 .stage 的 scrollWidth（它才是滚动容器；
    // .editor 是 overflow:visible，在它上面量不出来）。
    var st = document.querySelector('.stage');
    var savedHtml = editor.innerHTML;
    var longMath = '$$' + Array.from({ length: 40 }, function (_, i) { return 'a_{' + i + '}^2'; }).join(' + ') + ' = 0$$';
    editor.innerHTML = mdToHtml(longMath);
    editor.offsetHeight; // 强制重排后再量
    var over = Math.round(st.scrollWidth - st.clientWidth);
    t('长算式不撑破纸面', over <= 2, true);
    out.push('INFO 长算式下横向溢出=' + over + 'px（未修复时应约 1036px）');
    editor.innerHTML = savedHtml;

    // ---- ② 导入即留档 ----
    var before = JSON.parse(localStorage.getItem('folio.history') || '[]').length;
    document.getElementById('btn-paste').click();
    document.getElementById('paste-input').value = '# 导入留档测试\n\n这段内容导入后应当自动进历史。';
    document.getElementById('paste-confirm').click();
    var hist = JSON.parse(localStorage.getItem('folio.history') || '[]');
    t('导入后历史条数增加', hist.length > before, true);
    t('导入内容已在历史里', /导入留档测试/.test(hist[0] ? hist[0].html : ''), true);

    // ---- ③ 清空前留档 + 可撤销 ----
    editor.innerHTML = '<h1>清空目标</h1><p>这段内容在清空后应当能被撤销回来。</p>';
    var snapshot = editor.innerHTML;
    var histBefore = JSON.parse(localStorage.getItem('folio.history') || '[]').length;
    document.getElementById('btn-clear').click();
    t('已清空', editor.innerHTML.replace(/\s/g, ''), '');
    t('撤销条出现', document.getElementById('clear-bar').hidden, false);
    var histAfter = JSON.parse(localStorage.getItem('folio.history') || '[]');
    t('清空前内容已留档', /清空目标/.test(histAfter[0] ? histAfter[0].html : ''), true);
    t('留档使历史增加', histAfter.length > histBefore, true);
    document.getElementById('clear-undo').click();
    t('撤销后内容恢复', editor.innerHTML === snapshot, true);
    t('撤销后提示条消失', document.getElementById('clear-bar').hidden, true);

    // ---- ④ 清空后重新输入 → 撤销入口失效 ----
    editor.innerHTML = '<h1>第二次清空</h1><p>正文</p>';
    document.getElementById('btn-clear').click();
    t('第二次撤销条出现', document.getElementById('clear-bar').hidden, false);
    editor.innerHTML += '<p>新输入的内容</p>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    t('输入后撤销条失效', document.getElementById('clear-bar').hidden, true);

    // ---- ⑤ 空内容时清空应被拦下（不产生无意义的留档）----
    editor.innerHTML = '';
    var h5 = JSON.parse(localStorage.getItem('folio.history') || '[]').length;
    document.getElementById('btn-clear').click();
    t('空内容清空不留档', JSON.parse(localStorage.getItem('folio.history') || '[]').length, h5);

    var preOut = document.createElement('pre');
    preOut.id = 'zz-results';
    preOut.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(preOut);
  }, 700);
});
