# 打印泄漏检查：真实无头打印一份 PDF，确认「正文在、界面外壳不在、未知注入浮层不在」。
#
# 覆盖范围：**主文档打印路径**（window.print() 打印本页）。
#   它同时是「点下载 PDF」与「浏览器自带 Ctrl+P」的最终打印对象。
#   按钮点击链路本身（弹窗开关、标题替换、参数注入）由 tools/case_pdfpanel.js 覆盖。
#
# 真实验证的机制（不要再误标）：
#   · @media print 里的显式外壳清单（.toprule / .docbar / 工具面板 …）
#   · body > *:not(.workspace) { display:none }，用于兜住**未知的 body 级注入元素**
#   已知局限：扩展若把元素注入到 .workspace 内部（正文区里），仍会被打印 —— 脚本会把它作为 INFO 报出。
#
# 用法: python tools/print_check.py
#   换浏览器: FOLIO_BROWSER="...msedge.exe" python tools/print_check.py
import os, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWSER = os.environ.get("FOLIO_BROWSER") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SRC = os.path.join(REPO, "index.html")

BODY_MARK = "ZZBODY_正文明文标记"
EXT_MARK = "ZZEXT_EXTENSION_OVERLAY"      # 未知的 body 级注入（应被挡住）
EXT_INNER_MARK = "ZZEXT_INSIDE_CONTENT"   # 注入到正文区内部（已知局限，仅报告）
UI_MARKS = "ZZUI_"

UI_REGIONS = [
    ".toprule", "header.masthead", ".tabbar", "#toolbar", "#docbar", "#nav-pane",
    ".annot-sidebar", "footer.statusbar", "#tooltip", "#global-search", "#ctx-menu",
    "#sel-bar", "#zip-tool", "#imgpdf-tool", "#pdf-tool", "#repair-tool",
    "#library-tool", "#wordbook-tool", "#map-tool", "#focus-tool", "#split-tool",
    "#drop-overlay", "#toast", "#beautify-bar", "#pdf-modal",
]

SETUP = """
<script>
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    editor.innerHTML = '<h1>%s</h1><p>' + '这是一段正文，用于验证打印输出。'.repeat(40) + '</p>';

    // 未知的 body 级注入元素（模拟扩展往 body 挂浮层）—— 应被挡住
    var ext = document.createElement('div');
    ext.setAttribute('style',
      'position:fixed;top:30%%;right:16px;z-index:2147483647;' +
      'background:#fff;border:2px solid #e00;padding:14px 18px;color:#e00');
    ext.textContent = '%s';
    document.body.appendChild(ext);

    // 注入到正文区内部 —— 已知局限，仅作 INFO 报告
    var inner = document.createElement('div');
    inner.setAttribute('style', 'position:fixed;top:60%%;left:16px;z-index:2147483647;background:#ff0');
    inner.textContent = '%s';
    document.querySelector('.stage').appendChild(inner);

    // 给各界面区域塞唯一标记；找不到元素直接记录（会判失败，避免静默失去覆盖）
    var missing = [];
    %s.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) { missing.push(sel); return; }
      el.hidden = false;
      el.style.display = '';
      var s = document.createElement('span');
      s.textContent = '%s' + sel;
      el.appendChild(s);
    });
    window.__zzMissing = missing;

    // 真实跑一遍打印准备（与浏览器在打印前触发的 beforeprint 一致），
    // 顺带验证「纸张/边距参数」确实生效 —— 置为 A3，PDF 页面尺寸应随之变为 A3。
    var sel = document.getElementById('pdf-opt-page');
    sel.value = 'A3';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    window.dispatchEvent(new Event('beforeprint'));
  }, 400);
});
</script>
""" % (BODY_MARK, EXT_MARK, EXT_INNER_MARK, str(UI_REGIONS).replace("'", '"'), UI_MARKS)


def run():
    html = open(SRC, encoding="utf-8").read()
    # 注入到「最后一个 </body> 之前」：源码里可能有多处 <body>（注释/模板字符串），
    # 用 replace("<body>", …) 会命中最前面那处，曾因此在注释里注入、脚本静默失效
    idx = html.rfind("</body>")
    assert idx != -1, "找不到 </body>"
    patched = html[:idx] + SETUP + "\n" + html[idx:]
    assert patched != html
    hp = os.path.join(REPO, "_t_print.html")
    pp = os.path.join(REPO, "_t_print.pdf")
    open(hp, "w", encoding="utf-8").write(patched)
    try:
        subprocess.run([BROWSER, "--headless=new", "--disable-gpu", "--no-sandbox",
                        "--no-pdf-header-footer", "--virtual-time-budget=9000",
                        "--print-to-pdf=" + pp, "file:///" + hp.replace("\\", "/")],
                       capture_output=True, timeout=180)
        if not os.path.exists(pp):
            return None, None, None, None
        import pymupdf
        d = pymupdf.open(pp)
        text = "\n".join(p.get_text() for p in d)
        rect = d[0].rect
        n = d.page_count
        d.close()
        mm = (rect.width * 25.4 / 72, rect.height * 25.4 / 72)
        return text, n, mm, None
    finally:
        for f in (hp, pp):
            try: os.remove(f)
            except OSError: pass


print("=" * 68)
print("打印泄漏检查 —", os.path.basename(BROWSER))
print("=" * 68)
text, pages, mm, _ = run()
if text is None:
    print("PDF 未生成，无法判定")
    sys.exit(1)

body_ok = BODY_MARK in text
ext_ok = EXT_MARK in text
inner_ok = EXT_INNER_MARK in text
leaked_ui = [r for r in UI_REGIONS if (UI_MARKS + r) in text]

# 静态校验选择器是否还存在：若某个区域被改名/删除，注入会静默失效、
# 断言随之失去覆盖却依旧全绿 —— 这是测试最容易悄悄变空的方式，故直接判失败。
src = open(SRC, encoding="utf-8").read()
missing = []
for r in UI_REGIONS:
    token = r.lstrip('#.')
    if ('id="%s"' % token) not in src and ('class="%s' % token) not in src and (token not in src):
        missing.append(r)

print("PDF 页数            :", pages)
print("页面尺寸 (mm)        : %.0f x %.0f  <- 期望 A3 297x420（验证导出参数生效）" % mm)
print("阳性对照（正文在）    :", body_ok, " <- False 则测试无效")
print("未知 body 级注入是否被截入:", ext_ok, " <- 期望 False")
print("界面外壳是否被截入    :", leaked_ui if leaked_ui else "无", " <- 期望 无")
print("覆盖的区域数         :", len(UI_REGIONS) - len(missing), "/", len(UI_REGIONS),
      "" if not missing else (" <- 找不到: " + ", ".join(missing)))
print("-" * 68)
print("INFO 正文区内部注入是否被截入:", inner_ok, "（已知局限，不计入判定）")
print("-" * 68)

size_ok = abs(mm[0] - 297) < 3 and abs(mm[1] - 420) < 3
ok = body_ok and not ext_ok and not leaked_ui and size_ok and not missing
if not size_ok:
    print("!! 导出参数未生效：页面尺寸不是 A3")
if missing:
    print("!! 有区域选择器找不到，覆盖已失效")
print("结论:", "通过：只打印正文、导出参数生效、覆盖完整" if ok else "未通过")
print("=" * 68)
sys.exit(0 if ok else 1)
