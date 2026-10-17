// 公式滚动容器「按需安装」自检。
//
// 起因：最初为了救一条超长公式，给**所有** .math-block 常开了 overflow-x:auto。
// CSS 规定一轴为 auto 时另一轴的 visible 会被算成 auto，于是哪怕只有 1px 的竖向
// 舍入误差也会画出一根竖滚动条，还占掉 15px 宽 —— 实测 E=mc² 这种短公式就中招，
// 表现为「每根短公式旁边都挂着一条杠，纸面还被挤窄」。
// 现在的规则：只有真的放不下才加 .math-wide。
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(async function () {
    var out = [];
    function t(name, got, want) {
      out.push((String(got) === String(want) ? 'PASS ' : 'FAIL ') + name +
               ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    var emitted = false;
    function emitResults() {
      if (emitted) return;
      emitted = true;
      var pre = document.createElement('pre');
      pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
      document.body.appendChild(pre);
    }
    setTimeout(emitResults, 20000);
    try {
      await window.__folioReady;
      // 公式宽度依赖 KaTeX 字体；字体没到位就量，会得出错误的宽窄判断
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }

      function poly(k) {
        return '$$' + Array.from({ length: k }, function (_, i) { return 'a_{' + i + '}'; }).join(' + ') + ' = 0$$';
      }
      // 造出「有窄有宽」的一组：只有两种都存在，后面的断言才不是空转
      editor.innerHTML = mdToHtml(['# 探针', poly(3), poly(45)].join('\n\n'));
      renderAllAnnots();   // 走应用自己的钩子，而不是直接调 refreshMathOverflow

      var blocks = editor.querySelectorAll('.math-block');
      t('前置守卫：确实渲染出了多个公式块', blocks.length >= 2, true);
      var narrow = blocks[0], wide = blocks[blocks.length - 1];

      // ---- 1. 短公式：不该有任何滚动条 ----
      t('短公式没有装滚动容器', narrow.classList.contains('math-wide'), false);
      t('短公式没有横向溢出', narrow.scrollWidth <= narrow.clientWidth + 1, true);
      // 这两条是用户真正的痛点：之前短公式旁边挂着一根竖滚动条，还占掉 15px 宽
      t('短公式没有竖滚动条（没被吃掉宽度）', narrow.offsetWidth - narrow.clientWidth, 0);
      t('短公式没有横滚动条（没被吃掉高度）', narrow.offsetHeight - narrow.clientHeight, 0);

      // ---- 2. 超长公式：该装，且不能被裁切 ----
      t('超长公式装上了滚动容器', wide.classList.contains('math-wide'), true);
      t('超长公式确实横向放不下', wide.scrollWidth > wide.clientWidth + 1, true);
      t('超长公式有横向滚动条', wide.offsetHeight - wide.clientHeight > 0, true);
      t('超长公式没有多余的竖滚动条', wide.offsetWidth - wide.clientWidth, 0);
      // 横向滚动条会吃掉 15px 高；没有 padding 补回来就会把公式下缘裁掉
      var innerH = wide.firstElementChild ? wide.firstElementChild.getBoundingClientRect().height : 0;
      t('超长公式的内容没有被裁切（padding 补回了滚动条占的高度）',
        innerH <= wide.clientHeight + 1, true);
      out.push('INFO 超长公式 溢出=' + (wide.scrollWidth - wide.clientWidth) +
               'px 内容高=' + Math.round(innerH) + ' 可见高=' + wide.clientHeight);

      // ---- 3. 任何缩放下都要自洽：装了容器 ⟺ 真的放不下 ----
      function consistent() {
        var bs = editor.querySelectorAll('.math-block'), bad = 0;
        bs.forEach(function (b) {
          var over = b.scrollWidth > b.clientWidth + 1;
          if (b.classList.contains('math-wide') !== over) bad++;
        });
        return bad;
      }
      t('100% 下「装了容器」与「真的放不下」一致', consistent(), 0);
      setZoom(3);
      refreshMathOverflow(null, true);
      t('300% 下同样自洽', consistent(), 0);
      setZoom(1);
      refreshMathOverflow(null, true);
      t('缩回 100% 后仍然自洽', consistent(), 0);

      // ---- 4. 换缩放要重量：纸面宽度变了，原本放得下的可能放不下了 ----
      // poly(15) 在 100% 放得下、300% 放不下（实测），正好用来验证「会重量」
      editor.innerHTML = mdToHtml(['# 探针', poly(15)].join('\n\n'));
      renderAllAnnots();
      var m = editor.querySelector('.math-block');
      refreshMathOverflow(null, true);
      t('100% 下这根公式放得下', m.classList.contains('math-wide'), false);
      setZoom(3);
      refreshMathOverflow(null, true);
      t('300% 下同一根公式被判定为放不下（说明缩放后确实重量了）',
        m.classList.contains('math-wide'), true);
      setZoom(1);
      refreshMathOverflow(null, true);
      t('缩回 100% 后又摘掉了容器', m.classList.contains('math-wide'), false);

      // ---- 5. PDF 预览里的公式同理 ----
      editor.innerHTML = mdToHtml(['# 探针', poly(3), poly(45)].join('\n\n'));
      renderAllAnnots();
      openPdfModal();
      // 注意：PDF 预览里的长公式是**折行**的（实测 clientH 168、scrollW == clientW），
      // 不像编辑器里那样横向溢出。所以这里不能断言「长公式会被装上容器」——
      // 断言的是同一件事：不该有**无谓**的滚动条，且判定与实际溢出一致。
      var pv = document.querySelectorAll('#pdf-preview .math-block');
      if (pv.length) {
        var extra = 0, inconsistent = 0;
        pv.forEach(function (b) {
          if (b.offsetWidth !== b.clientWidth) extra++;   // 竖滚动条把内容挤窄了
          if (b.classList.contains('math-wide') !== (b.scrollWidth > b.clientWidth + 1)) inconsistent++;
        });
        t('预览里没有公式被多余的竖滚动条挤窄', extra, 0);
        t('预览里的判定与实际溢出情况一致', inconsistent, 0);
        t('预览里的短公式没有装滚动容器', pv[0].classList.contains('math-wide'), false);
      } else {
        out.push('FAIL 预览里没渲染出公式块，这一组断言没跑到');
      }
      closePdfModal();
    } catch (e) {
      out.push('FAIL 用例抛错 | ' + (e && e.stack ? e.stack : e));
    }
    emitResults();
  }, 400);
});
