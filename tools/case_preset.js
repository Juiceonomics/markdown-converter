window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    function t(name, got, want) {
      out.push((got === want ? 'PASS ' : 'FAIL ') + name + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    // 预设常量
    t('clean.h1.s', BEAUTIFY_PRESETS.clean.h1.s, '22pt');
    t('gov.body.s', BEAUTIFY_PRESETS.gov.body.s, '16pt');
    t('gov.line', BEAUTIFY_PRESETS.gov.line, '28pt');
    t('paper.indent', BEAUTIFY_PRESETS.paper.indent, '2em');
    // 排版：h1/h3/正文
    var r1 = beautifyApply('<h1>大</h1><h3>小</h3><p>正文</p>', 'gov');
    out.push('gov.html=' + r1.html);
    // C6：首标题平移 + 不跳级
    var r2 = beautifyApply('<h2>A</h2><h4>B</h4><h3>C</h3>', 'clean');
    t('C6', (r2.html.match(/<h[1-6]/g) || []).join(','), '<h1,<h2,<h3');
    // C6：同级兄弟必须仍是同级（逐元素 clamp 会在这里失败）
    var r2b = beautifyApply('<h2>第一章</h2><h3>1.1</h3><h3>1.2</h3><h4>1.2.1</h4>', 'clean');
    t('C6同级', (r2b.html.match(/<h[1-6]/g) || []).join(','), '<h1,<h2,<h2,<h3');
    // C6：文档从 h3 开始
    var r2c = beautifyApply('<h3>X</h3><h4>Y</h4><h4>Z</h4>', 'clean');
    t('C6起点h3', (r2c.html.match(/<h[1-6]/g) || []).join(','), '<h1,<h2,<h2');
    // C5：仅删中文之间空格，中英之间的保留
    var r3 = beautifyApply('<p>\u4e2d \u6587 English \u4e2d \u6587</p>', 'clean');
    t('C5', /English\s/.test(r3.html) && !/\u4e2d \u6587/.test(r3.html), true);
    // C4：转义残留
    var r4 = beautifyApply('<p>\\*abc\\*</p>', 'clean');
    t('C4', r4.html.indexOf('\\*') === -1, true);
    // C1/C2：空块清除
    var r5 = beautifyApply('<p></p><p><br></p><p>\u6709\u5185\u5bb9</p>', 'clean');
    t('C1C2', (r5.html.match(/<p/g) || []).length, 1);
    // 反例：pre/code 不得被改
    var r6 = beautifyApply('<pre><code>const a = 1;  \n\u4e2d \u6587</code></pre>', 'gov');
    t('pre\u4e0d\u6539', r6.html.indexOf('const a = 1;  ') !== -1 && r6.html.indexOf('\u4e2d \u6587') !== -1, true);
    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 400);
});
