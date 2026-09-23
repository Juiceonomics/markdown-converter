# 导入一键美化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让从 AI 复制来的 Markdown 文本导入后可一键套用排版/字体预设并清理复制残留，且随时可撤销。

**Architecture:** 全部改动在单文件 `index.html` 内。美化 = 对内容元素写**内联样式**（保证导出 Word 保留排版）+ 对 HTML 做文本级清理。三条入口（粘贴导入、工具栏菜单、撤销）共用同一组纯函数。

**Tech Stack:** 原生 JS（无框架）、DOMPurify/marked 已在用、无头 Chrome + pymupdf 做验证。

## Global Constraints

- 全部改动在 `index.html` 单文件内完成，**不新增外部资源**（保持离线）。
- 字号单位用 `pt`；字体回退栈必须与现有工具栏 `font-family` 的取值一致。
- 清理与排版**都不得触碰** `pre` / `code` / `script` / `style` 内的内容。
- 所有 localStorage 写入必须走现有 `safeSet()`（见 `index.html` 存储安全层），不得直接 `localStorage.setItem`。
- 新增 UI 元素必须在 `@media print` 的隐藏列表中登记（既有约定：任何界面元素都不得出现在导出 PDF 中）。
- 新增交互元素需 `cursor: pointer`、键盘可达、`focus-visible` 可见；过渡 150–250ms。
- 提交后直接 `git push origin main`。

---

### Task 1: 预设常量与纯函数（清理 + 排版）

**Files:**
- Modify: `index.html` — 在 `// ===== PDF 预览弹窗` 之前的合适位置新增一组函数
- Create: `tools/headless_check.py` — 可复用的无头 Chrome 校验脚本

**Interfaces:**
- Consumes: 无（纯函数，不依赖应用状态）
- Produces:
  - `BEAUTIFY_PRESETS` — `{ clean|gov|paper: { label, h1, h2, h3, body, line, indent, para } }`，其中 `h1/h2/h3/body` 为 `{ f, s }`（h 另含 `w`）
  - `beautifyApply(html: string, presetKey: string) -> { html: string, stat: { emptyRemoved, headings, texts } }`

- [ ] **Step 1: 建立可复用的无头 Chrome 校验脚本**

创建 `tools/headless_check.py`（这是后续所有任务的验证入口，也是路线图 ④ 回归测试集的起点）：

```python
# 可复用的无头 Chrome 校验：加载 index.html，注入 JS，断言表达式，回传结果。
# 用法: python tools/headless_check.py <注入JS文件>
# 注入脚本需自行输出以 "FAIL " 开头的行表示失败；脚本据此以非零码退出。
import os, re, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SRC = os.path.join(REPO, "index.html")

def run(inject_js: str) -> str:
    html = open(SRC, encoding="utf-8").read()
    tag = "<script>\n" + inject_js + "\n</script>"
    patched = html.replace("<body>", "<body>\n" + tag, 1)
    assert patched != html, "注入失败"
    hp = os.path.join(REPO, "_t_check.html")
    open(hp, "w", encoding="utf-8").write(patched)
    try:
        res = subprocess.run(
            [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--virtual-time-budget=9000", "--dump-dom",
             "file:///" + hp.replace("\\", "/")],
            capture_output=True, timeout=180, text=True,
            encoding="utf-8", errors="replace")
        dom = res.stdout or ""
        m = re.search(r"ZZBEGIN\n(.*?)\nZZEND", dom, re.S)
        return m.group(1) if m else "(未捕获结果)\n" + dom[:600]
    finally:
        if os.path.exists(hp):
            os.remove(hp)

if __name__ == "__main__":
    inject = open(sys.argv[1], encoding="utf-8").read()
    print(run(inject))
```

- [ ] **Step 2: 写失败校验（先证明函数还不存在）**

创建 `tools/case_preset.js`：

```js
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = [];
    try {
      out.push('BEAUTIFY_PRESETS.clean.h1.s = ' + BEAUTIFY_PRESETS.clean.h1.s);
    } catch (e) { out.push('ERR ' + e.message); }
    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 400);
});
```

Run: `PYTHONIOENCODING=utf-8 python tools/headless_check.py tools/case_preset.js`
Expected: 输出含 `ERR BEAUTIFY_PRESETS is not defined`（证明尚未实现）

- [ ] **Step 3: 实现预设常量**

在 `index.html` 中 `// ===== PDF 预览弹窗` 注释之前插入：

```js
  // ===== 导入一键美化 =====
  // 三套预设：字体/字号/字重/行距/缩进/段距。字号用 pt（导出与打印一致）。
  // 字体回退栈与工具栏 font-family 取值保持一致。
  const BEAUTIFY_PRESETS = {
    clean: {
      label: '清爽',
      h1: { f: '"Microsoft YaHei", "微软雅黑", sans-serif', s: '22pt', w: '700' },
      h2: { f: '"Microsoft YaHei", "微软雅黑", sans-serif', s: '16pt', w: '700' },
      h3: { f: '"Microsoft YaHei", "微软雅黑", sans-serif', s: '14pt', w: '700' },
      body: { f: '"宋体", SimSun, serif', s: '12pt' },
      line: '1.75', indent: '0', para: '0.8em 0', hm: '1.2em 0 0.5em'
    },
    gov: {
      label: '公文',
      h1: { f: '"方正小标宋简体", FZXiaoBiaoSong-B05S, "方正小标宋", serif', s: '22pt', w: '400' },
      h2: { f: '"黑体", SimHei, sans-serif', s: '16pt', w: '400' },
      h3: { f: '"楷体_GB2312", KaiTi_GB2312, "楷体", serif', s: '16pt', w: '400' },
      body: { f: '"仿宋_GB2312", FangSong_GB2312, "仿宋", serif', s: '16pt' },
      line: '28pt', indent: '2em', para: '0 0', hm: '1em 0 0.5em'
    },
    paper: {
      label: '论文',
      h1: { f: '"黑体", SimHei, sans-serif', s: '18pt', w: '700' },
      h2: { f: '"黑体", SimHei, sans-serif', s: '14pt', w: '700' },
      h3: { f: '"黑体", SimHei, sans-serif', s: '12pt', w: '700' },
      body: { f: '"宋体", SimSun, serif', s: '12pt' },
      line: '1.5', indent: '2em', para: '0.6em 0', hm: '1.1em 0 0.45em'
    }
  };
```

- [ ] **Step 4: 实现清理与排版纯函数**

紧接预设常量之后插入：

```js
  // 取 root 下所有文本节点，跳过代码/脚本内部（清理与排版都不得改动代码）
  function bzTextNodes(root) {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        let p = n.parentNode;
        while (p && p !== root) {
          const t = p.nodeName;
          if (t === 'PRE' || t === 'CODE' || t === 'SCRIPT' || t === 'STYLE') return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }
  const BZ_CJK = '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3040-\\u30ff';
  // 文本级清理（C3 行尾空格 / C4 转义残留 / C5 仅中文之间的多余空格）
  function bzCleanText(s) {
    return s
      .replace(new RegExp('([' + BZ_CJK + '])[ \\t\\u3000]+(?=[' + BZ_CJK + '])', 'g'), '$1')
      .replace(/\\([*_#\[\]()~`+\-.!])/g, '$1')
      .replace(/[ \t\u3000]+$/gm, '');
  }
  // C1 + C2：删除空块（一并达成「合并连续空行」）
  function bzRemoveEmptyBlocks(root) {
    let n = 0;
    root.querySelectorAll('p, div, li').forEach(el => {
      if (el.querySelector('pre, code, img, table, ul, ol')) return;
      if (el.tagName === 'LI' && el.querySelector('p, div')) return;
      if ((el.textContent || '').replace(/[\s\u3000\u00a0]+/g, '')) return;
      el.remove(); n++;
    });
    return n;
  }
  // C6：标题层级归一化——首标题归一为 h1，且不允许跳级。
  // 用「映射表」而非逐元素 clamp：逐元素会把同级兄弟打散
  //（如 ### 1.1 / ### 1.2 会被算成不同级别），破坏文档结构。
  function bzNormalizeHeadings(root) {
    const hs = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    if (!hs.length) return 0;
    const lvlOf = h => Number(h.tagName[1]);
    const map = {};
    let prev = 0, changed = 0;
    hs.forEach(h => {
      const o = lvlOf(h);
      let n;
      if (o in map) { n = map[o]; }
      else { n = Math.min(o, prev + 1); map[o] = n; }
      if (n !== o) {
        const nh = document.createElement('h' + n);
        nh.innerHTML = h.innerHTML;
        h.replaceWith(nh);
        changed++;
      }
      prev = n;
    });
    return changed;
  }
  // 清理 + 排版。返回新 HTML 与统计。
  function beautifyApply(html, presetKey) {
    const p = BEAUTIFY_PRESETS[presetKey] || BEAUTIFY_PRESETS.clean;
    const root = document.createElement('div');
    root.innerHTML = html;
    const stat = { emptyRemoved: 0, headings: 0, texts: 0 };
    stat.emptyRemoved = bzRemoveEmptyBlocks(root);
    stat.headings = bzNormalizeHeadings(root);
    bzTextNodes(root).forEach(n => {
      const before = n.nodeValue;
      const after = bzCleanText(before);
      if (after !== before) { n.nodeValue = after; stat.texts++; }
    });
    // 标题：四级及以下统一按三级处理；内联关掉编辑器默认装饰线
    [['h1', 'h1'], ['h2', 'h2'], ['h3', 'h3'], ['h4', 'h3'], ['h5', 'h3'], ['h6', 'h3']].forEach(pair => {
      root.querySelectorAll(pair[0]).forEach(el => {
        const c = p[pair[1]];
        el.style.fontFamily = c.f;
        el.style.fontSize = c.s;
        el.style.fontWeight = c.w;
        el.style.lineHeight = p.line;
        el.style.borderBottom = 'none';
        el.style.paddingBottom = '0';
        el.style.margin = p.hm;
      });
    });
    // 正文：段落缩进；列表/表格/引用不缩进
    root.querySelectorAll('p, li, td, th, blockquote').forEach(el => {
      el.style.fontFamily = p.body.f;
      el.style.fontSize = p.body.s;
      el.style.lineHeight = p.line;
      // 首行缩进只给「正文段落」：表格/列表/引用内的段落不缩进（缩进会很难看）
      if (el.tagName === 'P' && !el.closest('td, th, li, blockquote')) {
        el.style.textIndent = p.indent;
        el.style.margin = p.para;
      }
    });
    return { html: root.innerHTML, stat };
  }
```

> 说明（相对 spec 的一处实现细化）：装饰线用**内联** `border-bottom:none` 关闭，而不是编辑器根节点上的类名。内联方式更简单，且屏幕 / PDF / Word 三处行为一致。

- [ ] **Step 5: 写通过的校验**

改写 `tools/case_preset.js`：

```js
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
    // C6：首标题归一为 h1 + 不跳级
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
```

Run: `PYTHONIOENCODING=utf-8 python tools/headless_check.py tools/case_preset.js`
Expected: 全部 `PASS`，无 `FAIL`

- [ ] **Step 6: 提交**

```bash
git add index.html tools/headless_check.py tools/case_preset.js
git commit -m "美化：预设常量与清理/排版纯函数（含无头校验脚本）"
git push origin main
```

---

### Task 2: 应用到文档 + 撤销

**Files:**
- Modify: `index.html` — 在 Task 1 的函数之后新增

**Interfaces:**
- Consumes: `BEAUTIFY_PRESETS`、`beautifyApply(html, presetKey)`（Task 1）；现有 `docById`、`editor`、`activeDocId`、`showToast`、`safeSet`、`renderDocTabs`
- Produces:
  - `loadBeautifyCfg() -> { preset, auto }`、`saveBeautifyCfg(cfg)`
  - `beautifyDoc(presetKey) -> boolean`（作用于当前激活文档）
  - `beautifyUndoNow() -> boolean`
  - `getBeautifyBarState() -> null | { mode: 'ask'|'applied', preset }`

- [ ] **Step 1: 实现设置持久化与套用/撤销**

在 Task 1 代码之后插入：

```js
  const BEAUTIFY_CFG_KEY = 'folio.beautify';
  const BEAUTIFY_DEFAULT_CFG = { preset: 'clean', auto: false };
  function loadBeautifyCfg() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(BEAUTIFY_CFG_KEY)) || {}; } catch (e) {}
    return {
      preset: BEAUTIFY_PRESETS[o.preset] ? o.preset : BEAUTIFY_DEFAULT_CFG.preset,
      auto: !!o.auto
    };
  }
  function saveBeautifyCfg(cfg) {
    if (!safeSet(BEAUTIFY_CFG_KEY, JSON.stringify(cfg))) warnStorageFull();
  }

  // 撤销状态：记录「最初原始 HTML」，换方案不覆盖，确保撤销回到未美化前
  let beautifyUndo = null;   // { docId, originalHtml, appliedHtml }
  let beautifyAsk = null;    // 待询问的 docId（仅粘贴导入后）

  function beautifyDoc(presetKey) {
    if (view !== 'editor') return false;
    const d = docById(activeDocId);
    if (!d) return false;
    const current = editor.innerHTML;
    if (!current.replace(/[\s\u3000\u00a0]+/g, '')) { showToast('内容为空，无法美化'); return false; }
    // 已存在针对该文档的撤销记录时不覆盖「最初原始」
    if (!beautifyUndo || beautifyUndo.docId !== d.id) {
      beautifyUndo = { docId: d.id, originalHtml: current, appliedHtml: '' };
    }
    const { html, stat } = beautifyApply(current, presetKey);
    d.html = html;
    d.beautifyPreset = presetKey;
    editor.innerHTML = html;
    beautifyUndo.appliedHtml = html;
    beautifyAsk = null;
    const cfg = loadBeautifyCfg();
    saveBeautifyCfg({ preset: presetKey, auto: cfg.auto });
    renderDocTabs();
    saveDocsState();
    refreshBeautifyBar();
    const n = stat.emptyRemoved + stat.headings + stat.texts;
    showToast('已套用「' + BEAUTIFY_PRESETS[presetKey].label + '」' + (n ? '，清理了 ' + n + ' 处' : ''));
    return true;
  }

  function beautifyUndoNow() {
    if (!beautifyUndo) return false;
    const d = docById(beautifyUndo.docId);
    if (!d) return false;
    d.html = beautifyUndo.originalHtml;
    delete d.beautifyPreset;
    if (activeDocId === beautifyUndo.docId && view === 'editor') editor.innerHTML = beautifyUndo.originalHtml;
    beautifyUndo = null;
    renderDocTabs();
    saveDocsState();
    refreshBeautifyBar();
    showToast('已撤销美化');
    return true;
  }
```

- [ ] **Step 2: 写失败校验**

创建 `tools/case_apply.js`：

```js
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
```

Run: `PYTHONIOENCODING=utf-8 python tools/headless_check.py tools/case_apply.js`
Expected: 含 `FAIL`（`beautifyDoc is not defined` 会让 after 步骤抛错 → 在 Step 3 之前先跑一次确认失败）

- [ ] **Step 3: 运行校验确认通过**

Run: `PYTHONIOENCODING=utf-8 python tools/headless_check.py tools/case_apply.js`
Expected: 全部 `PASS`

- [ ] **Step 4: 提交**

```bash
git add index.html tools/case_apply.js
git commit -m "美化：套用/撤销与设置持久化"
git push origin main
```

---

### Task 3: 导入后的询问条

**Files:**
- Modify: `index.html` — 新增浮条 HTML、CSS、`refreshBeautifyBar()`；在 `paste-confirm` 处理里触发询问

**Interfaces:**
- Consumes: `beautifyDoc`、`beautifyUndoNow`、`getBeautifyBarState` 所需的 `beautifyUndo` / `beautifyAsk`
- Produces: `refreshBeautifyBar()`、`askBeautifyForPasted()`；元素 id `#beautify-bar`

- [ ] **Step 1: 加浮条 HTML**

在 `<section class="split-tool" ...>` 之后插入：

```html
<div class="beautify-bar" id="beautify-bar" hidden>
  <span class="bz-msg" id="bz-msg">✨ 要一键美化这篇吗？</span>
  <span class="bz-acts" id="bz-acts"></span>
  <label class="bz-auto" id="bz-auto-wrap"><input type="checkbox" id="bz-auto"> 以后自动套用</label>
  <button class="bz-dismiss" id="bz-dismiss" aria-label="关闭提示条">×</button>
</div>
```

- [ ] **Step 2: 加浮条 CSS**

加在 `.split-tool` 相关样式之后：

```css
  /* 导入美化提示条（仅屏幕显示，打印时随其它界面元素一并隐藏） */
  .beautify-bar {
    position: fixed; left: 50%; transform: translateX(-50%); bottom: 22px; z-index: 90;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    max-width: min(92vw, 760px); padding: 10px 16px;
    background: var(--sheet); border: 1px solid var(--hairline-strong); border-radius: 999px;
    box-shadow: 0 10px 34px rgba(27,26,23,.16); font-size: 13px; color: var(--ink-2);
  }
  .beautify-bar[hidden] { display: none !important; }
  .bz-msg { font-weight: 600; color: var(--ink); }
  .bz-acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .bz-acts button { font-size: 12.5px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--hairline-strong); background: var(--paper); color: var(--ink); cursor: pointer; transition: border-color .18s var(--ease), background .18s var(--ease); }
  .bz-acts button:hover { border-color: var(--accent); background: var(--accent-soft); }
  .bz-acts button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .bz-auto { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); cursor: pointer; }
  .bz-dismiss { border: none; background: transparent; color: var(--muted); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .bz-dismiss:hover { color: var(--ink); }
```

同时在 `@media print` 的隐藏列表中加入 `.beautify-bar`（追加到 `.zip-tool, .lib-tool, ...` 那一行的末尾）。

- [ ] **Step 3: 实现渲染逻辑**

在 Task 2 代码之后插入：

```js
  const beautifyBar = document.getElementById('beautify-bar');
  const bzMsg = document.getElementById('bz-msg');
  const bzActs = document.getElementById('bz-acts');
  const bzAuto = document.getElementById('bz-auto');
  const bzAutoWrap = document.getElementById('bz-auto-wrap');

  function bzPresetButtons(onPick) {
    bzActs.innerHTML = '';
    Object.keys(BEAUTIFY_PRESETS).forEach(k => {
      const b = document.createElement('button');
      b.textContent = BEAUTIFY_PRESETS[k].label;
      b.addEventListener('click', () => onPick(k));
      bzActs.appendChild(b);
    });
  }
  function hideBeautifyBar() { beautifyBar.hidden = true; }

  // 决定当前应显示哪种状态：ask（询问）/ applied（可撤销）/ 不显示
  function refreshBeautifyBar() {
    if (view !== 'editor') { hideBeautifyBar(); return; }
    // 已编辑过 → 撤销入口失效
    if (beautifyUndo && beautifyUndo.docId === activeDocId && editor.innerHTML !== beautifyUndo.appliedHtml) {
      beautifyUndo = null;
    }
    if (beautifyAsk === activeDocId && !beautifyUndo) {
      bzMsg.textContent = '✨ 要一键美化这篇吗？';
      bzAutoWrap.hidden = false;
      const cfg = loadBeautifyCfg();
      bzAuto.checked = cfg.auto;
      bzPresetButtons(k => beautifyDoc(k));
      const skip = document.createElement('button');
      skip.textContent = '不用了';
      skip.addEventListener('click', () => { beautifyAsk = null; hideBeautifyBar(); });
      bzActs.appendChild(skip);
      beautifyBar.hidden = false;
      return;
    }
    if (beautifyUndo && beautifyUndo.docId === activeDocId) {
      const label = BEAUTIFY_PRESETS[docById(activeDocId)?.beautifyPreset]?.label || '';
      bzMsg.textContent = '✓ 已美化' + (label ? '（' + label + '）' : '');
      bzAutoWrap.hidden = true;
      const undo = document.createElement('button');
      undo.className = 'primary';
      undo.textContent = '撤销';
      undo.addEventListener('click', () => beautifyUndoNow());
      bzActs.appendChild(undo);
      bzPresetButtons(k => beautifyDoc(k));
      beautifyBar.hidden = false;
      return;
    }
    hideBeautifyBar();
  }
  bzAuto.addEventListener('change', () => {
    const cfg = loadBeautifyCfg();
    saveBeautifyCfg({ preset: cfg.preset, auto: bzAuto.checked });
    showToast(bzAuto.checked ? '以后粘贴导入会自动套用「' + BEAUTIFY_PRESETS[cfg.preset].label + '」' : '已关闭自动套用');
  });
  document.getElementById('bz-dismiss').addEventListener('click', () => { beautifyAsk = null; hideBeautifyBar(); });
```

- [ ] **Step 4: 粘贴导入后触发询问**

把 `paste-confirm` 的处理改为（在原 `openNewDoc(...)` 之后追加逻辑）：

```js
  document.getElementById('paste-confirm').addEventListener('click', () => {
    const text = pasteInput.value.trim();
    if (!text) { showToast('请输入 Markdown 内容'); return; }
    openNewDoc(mdToHtml(text), null); // 开新标签，不覆盖当前文档
    saveDraft();
    pasteModal.hidden = true;
    const cfg = loadBeautifyCfg();
    if (cfg.auto) {
      beautifyDoc(cfg.preset);          // 自动套用，仍显示可撤销的状态条
    } else {
      beautifyAsk = activeDocId;        // 询问
      refreshBeautifyBar();
    }
    showToast('已载入 Markdown 文本（新标签）');
  });
```

- [ ] **Step 5: 切标签/切视图时刷新浮条**

在 `loadDoc()` 末尾与 `setView()` 的 `if (isEditor) {` 分支内各加一行：

```js
    refreshBeautifyBar();
```

- [ ] **Step 6: 写校验**

创建 `tools/case_bar.js`：

```js
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
    var pre = document.createElement('pre');
    pre.textContent = 'ZZBEGIN\n' + out.join('\n') + '\nZZEND';
    document.body.appendChild(pre);
  }, 600);
});
```

Run: `PYTHONIOENCODING=utf-8 python tools/headless_check.py tools/case_bar.js`
Expected: 全部 `PASS`

- [ ] **Step 7: 提交**

```bash
git add index.html tools/case_bar.js
git commit -m "美化：导入后询问条与撤销入口"
git push origin main
```

---

### Task 4: 工具栏「美化 ▾」菜单

**Files:**
- Modify: `index.html` — 工具栏加 `.dd-wrap`；菜单项与自动套用开关

**Interfaces:**
- Consumes: `beautifyDoc`、`loadBeautifyCfg`、`saveBeautifyCfg`、`refreshBeautifyBar`
- Produces: 元素 id `#beautify-dd`

- [ ] **Step 1: 加工具栏下拉**

在工具栏「历史 ▾」所在的 `.dd-wrap` 之后插入：

```html
    <div class="dd-wrap">
      <button class="dd-trigger" data-dd="beautify-dd" data-tip="一键美化" data-tip-desc="按预设统一排版与字体，并清理复制残留；套用后可撤销">美化 ▾</button>
      <div class="dd" id="beautify-dd" hidden>
        <button data-bz="clean">清爽（看资料）</button>
        <button data-bz="gov">公文（交文件）</button>
        <button data-bz="paper">论文（学术）</button>
        <div class="dd-sep"></div>
        <button data-bz-auto="1" id="bz-auto-toggle">粘贴导入时自动套用</button>
      </div>
    </div>
```

> `.dd-sep` 类当前**不存在**，需一并新增这条 CSS（放在现有 `.dd button:focus-visible` 之后）：
>
> ```css
>   .dd-sep { height: 1px; background: var(--hairline); margin: 5px 8px; }
> ```

- [ ] **Step 2: 接线**

在 Task 3 代码之后插入：

```js
  document.getElementById('beautify-dd').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.bz) { beautifyDoc(b.dataset.bz); closeAllDDs(); return; }
    if (b.dataset.bzAuto) {
      const cfg = loadBeautifyCfg();
      saveBeautifyCfg({ preset: cfg.preset, auto: !cfg.auto });
      updateBzAutoToggle();
      showToast(!cfg.auto ? '已开启：粘贴导入时自动套用' : '已关闭自动套用');
      closeAllDDs();
    }
  });
  function updateBzAutoToggle() {
    const cfg = loadBeautifyCfg();
    const b = document.getElementById('bz-auto-toggle');
    if (b) b.textContent = '粘贴导入时自动套用：' + (cfg.auto ? '开' : '关');
  }
  updateBzAutoToggle();
```

- [ ] **Step 3: 写校验**

创建 `tools/case_menu.js`：

```js
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
```

Run: `PYTHONIOENCODING=utf-8 python tools/headless_check.py tools/case_menu.js`
Expected: 全部 `PASS`

- [ ] **Step 4: 提交**

```bash
git add index.html tools/case_menu.js
git commit -m "美化：工具栏菜单与自动套用开关"
git push origin main
```

---

### Task 5: PDF 面板联动、备份纳入、README

**Files:**
- Modify: `index.html` — PDF 面板置灰逻辑；备份导出/导入纳入 `folio.beautify`；README

**Interfaces:**
- Consumes: `docById(activeDocId).beautifyPreset`、`openPdfModal()`、现有备份的 `data` 对象与 `history-export` 处理
- Produces: `syncPdfPanelWithBeautify()`

- [ ] **Step 1: PDF 面板置灰与提示**

在 `openPdfModal()` 内 `syncPdfPreview();` 之前加一行调用，并新增函数：

```js
  // 美化用绝对字号，内联样式优先级高于面板的 .editor{font-size}，
  // 因此美化过的文档把「字号/行距」置灰并说明，避免用户以为改了没生效
  function syncPdfPanelWithBeautify() {
    const d = docById(activeDocId);
    const presetKey = d && d.beautifyPreset;
    const label = presetKey && BEAUTIFY_PRESETS[presetKey] ? BEAUTIFY_PRESETS[presetKey].label : '';
    [pdfOptEls.font, pdfOptEls.line].forEach(el => {
      el.disabled = !!presetKey;
      el.title = presetKey ? '本文已套用「' + label + '」样式，字号与行距由样式决定' : '';
    });
    const tip = document.querySelector('.pdf-opt-tip');
    if (tip) {
      tip.textContent = presetKey
        ? '本文已套用「' + label + '」样式，字号与行距由样式决定'
        : '页码：在打印对话框勾选「页眉和页脚」';
    }
  }
```

并在 `openPdfModal()` 中 `syncPdfPreview();` 前插入 `syncPdfPanelWithBeautify();`。

- [ ] **Step 2: 备份纳入**

在备份导出的 `data` 对象里增加一行（紧邻 `snapshots: getSnapshots()`）：

```js
      beautify: loadBeautifyCfg(),
```

在备份导入的处理里增加：

```js
      if (data.beautify && typeof data.beautify === 'object') {
        saveBeautifyCfg({ preset: BEAUTIFY_PRESETS[data.beautify.preset] ? data.beautify.preset : 'clean', auto: !!data.beautify.auto });
        updateBzAutoToggle();
      }
```

- [ ] **Step 3: README**

在「Markdown 编辑器」功能列表中，`导出 Word / PDF` 那条之后加：

```markdown
- ✨ **一键美化**：从 AI 复制的 Markdown 导入时可一键套用排版（清爽 / 公文 / 论文三套预设），并自动清理多余空行、行尾空格、转义残留、中文间多余空格、标题层级跳跃；套用后可一键撤销；也可随时从工具栏「美化」手动套用
```

- [ ] **Step 4: 写端到端校验（含 PDF 面板与打印回归）**

创建 `tools/case_pdfpanel.js`：

```js
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
```

Run: `PYTHONIOENCODING=utf-8 python tools/headless_check.py tools/case_pdfpanel.js`
Expected: 全部 `PASS`

- [ ] **Step 5: 打印回归（界面元素不得出现在 PDF 中）**

用 Task 1 的脚本生成一次 PDF，确认提示条不泄漏：

```bash
PYTHONIOENCODING=utf-8 python - <<'PY'
import subprocess, os, sys
sys.path.insert(0, 'tools')
from headless_check import REPO, CHROME
# 注入：美化后触发打印，并在提示条里塞入唯一标记
js = """
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function(){ setTimeout(function(){
  editor.innerHTML = '<h1>正文标记ABC</h1><p>段落</p>';
  beautifyDoc('gov');
  var b = document.getElementById('beautify-bar');
  b.hidden = false;
  var s = document.createElement('span'); s.textContent = 'ZZ_BAR_SENTINEL';
  b.appendChild(s);
  document.getElementById('btn-pdf').click();
  document.getElementById('pdf-download').click();
}, 500); });
"""
html = open(os.path.join(REPO,'index.html'), encoding='utf-8').read().replace('<body>', '<body>\n<script>'+js+'</script>', 1)
hp = os.path.join(REPO,'_t_pdfcheck.html'); open(hp,'w',encoding='utf-8').write(html)
pp = os.path.join(REPO,'_t_pdfcheck.pdf')
subprocess.run([CHROME,'--headless=new','--disable-gpu','--no-sandbox','--no-pdf-header-footer',
                '--virtual-time-budget=9000','--print-to-pdf='+pp,'file:///'+hp.replace('\\','/')],
               capture_output=True, timeout=180)
import pymupdf
d = pymupdf.open(pp); txt = "\n".join(p.get_text() for p in d); d.close(); 
print('正文标记在 PDF 中:', '正文标记ABC' in txt)
print('提示条标记泄漏:', 'ZZ_BAR_SENTINEL' in txt)
for f in (hp, pp):
    try: os.remove(f)
    except OSError: pass
PY
```

Expected: `正文标记在 PDF 中: True` 且 `提示条标记泄漏: False`

- [ ] **Step 6: 提交**

```bash
git add index.html README.md tools/case_pdfpanel.js
git commit -m "美化：PDF 面板联动、备份纳入、README"
git push origin main
```

---

## 完成标准

- 三套预设套用后，标题/正文字体与字号符合 spec §2 常量表
- C1~C6 全部生效，且 `pre`/`code` 内内容未被改动
- 粘贴导入 → 询问条 → 套用 → 撤销，全链路可用；编辑后撤销入口消失
- 工具栏「美化 ▾」可随时套用；自动套用开关持久化
- 美化过的文档，PDF 面板字号/行距置灰并提示
- 导出 PDF 中**不含**任何界面元素（含新增的提示条）
- `folio.beautify` 随备份导出/导入
