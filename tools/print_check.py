# 打印泄漏检查：真实无头打印一份 PDF，确认「正文在、界面外壳不在、扩展注入的浮层不在」。
# 覆盖两类历史问题：
#   1) 应用自身的界面元素被截进 PDF（文件标签栏、工具面板等）
#   2) 浏览器扩展注入的浮层遮挡正文
# 用法: python tools/print_check.py
#   默认 Chrome；换 Edge：
#     FOLIO_BROWSER="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" python tools/print_check.py
#
# 说明：无头 --print-to-pdf 只打主文档，因此本工具验证的是「主文档兜底路径」（用户手动 Ctrl+P 走的那条）。
#      正常导出路径改为离屏 iframe 打印，其文档组装由 tools/case_iframe_print.js 覆盖。
import os, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWSER = os.environ.get("FOLIO_BROWSER") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SRC = os.path.join(REPO, "index.html")

BODY_MARK = "ZZBODY_正文明文标记"
EXT_MARK = "ZZEXT_EXTENSION_OVERLAY"
UI_MARKS = "ZZUI_"          # 注入到各界面区域的标记前缀

# 这些区域若出现在 PDF 中即为泄漏（应用自身外壳）
UI_REGIONS = [
    ".toprule", "header.masthead", ".tabbar", "#toolbar", "#docbar",
    "#nav-pane", ".annot-sidebar", "footer.statusbar", "#toast",
    "#global-search", "#ctx-menu", "#library-tool", "#split-tool", "#beautify-bar",
]

SETUP = """
<script>
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    editor.innerHTML = '<h1>%s</h1><p>' + '这是一段正文，用于验证打印输出。'.repeat(40) + '</p>';
    // 模拟浏览器扩展注入的浮层
    var ext = document.createElement('div');
    ext.setAttribute('style',
      'position:fixed;top:30%%;right:16px;z-index:2147483647;' +
      'background:#fff;border:2px solid #e00;padding:14px 18px;color:#e00');
    ext.textContent = '%s';
    document.body.appendChild(ext);
    // 给各界面区域塞入唯一标记（若它们被打印，标记就会出现在 PDF 里）
    %s.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      el.hidden = false;
      el.style.display = '';
      var s = document.createElement('span');
      s.textContent = '%s' + sel;
      el.appendChild(s);
    });
  }, 400);
});
</script>
""" % (BODY_MARK, EXT_MARK, str(UI_REGIONS).replace("'", '"'), UI_MARKS)


def run():
    html = open(SRC, encoding="utf-8").read()
    patched = html.replace("<body>", "<body>\n" + SETUP, 1)
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
            return None, None
        import pymupdf
        d = pymupdf.open(pp)
        text = "\n".join(p.get_text() for p in d)
        pages = d.page_count
        d.close()
        return text, pages
    finally:
        for f in (hp, pp):
            try: os.remove(f)
            except OSError: pass


print("=" * 66)
print("打印泄漏检查 —", os.path.basename(BROWSER))
print("=" * 66)
text, pages = run()
if text is None:
    print("PDF 未生成，无法判定"); sys.exit(1)

body_ok = BODY_MARK in text
ext_ok = EXT_MARK in text
leaked_ui = [r for r in UI_REGIONS if (UI_MARKS + r) in text]

print("PDF 页数           :", pages)
print("阳性对照（正文在）  :", body_ok, " <- False 则测试无效")
print("扩展浮层是否被截入  :", ext_ok, " <- 期望 False")
print("界面外壳是否被截入  :", leaked_ui if leaked_ui else "无", " <- 期望 无")
print("-" * 66)
ok = body_ok and not ext_ok and not leaked_ui
print("结论:", "通过：只打印正文" if ok else "未通过")
print("=" * 66)
sys.exit(0 if ok else 1)
