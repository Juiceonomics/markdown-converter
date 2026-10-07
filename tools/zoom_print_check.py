# 纸面缩放不得渗进打印：同一份文档按 100% 与 200% 各真打一份 PDF，结果必须完全一致。
#
# 机制：屏幕缩放是写在 .stage 内联样式上的 --folio-zoom，
#   @media print 里用 `.stage, .stage > .editor, .stage > .source { --folio-zoom: 1 !important; }`
#   复位（重要声明优先于普通内联样式）。
#
# 本脚本自带 RED 对照（第三次打印）：把复位规则从源码里剥掉再按 200% 打一次。
#   · 若这次结果与 100% 相同 → 说明打印介质里 zoom 本就不生效，
#     那么复位规则和这条断言都是**空转**，本脚本判定失败并提示删掉它们。
#   · 若这次结果不同 → 证明 zoom 确实会渗进打印、复位规则确实在起作用，
#     前两次的「一致」才是有意义的结论。
# 这样就不必依赖一次性的手工验证 —— 断言的有效性由脚本自己持续证明。
#
# 用法: python tools/zoom_print_check.py
#   换浏览器: FOLIO_BROWSER="...msedge.exe" python tools/zoom_print_check.py
import os, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWSER = os.environ.get("FOLIO_BROWSER") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SRC = os.path.join(REPO, "index.html")

BODY_MARK = "ZZBODY_纸面缩放打印对照"
# 打印复位规则里的那句声明，用于 RED 对照时精确剥离
RESET_DECL = "--folio-zoom: 1 !important;"

SETUP = """
<script>
try { localStorage.clear(); } catch (e) {}
window.addEventListener('load', function () {
  setTimeout(function () {
    var body = '<h1>%s</h1>';
    for (var i = 0; i < 60; i++) {
      body += '<p>' + '这是一段用于分页对照的正文内容。'.repeat(8) + '</p>';
    }
    editor.innerHTML = body;
    // 与真实路径一致：屏幕缩放写在 .stage 的内联样式上
    document.querySelector('.stage').style.setProperty('--folio-zoom', '%s');
    window.dispatchEvent(new Event('beforeprint'));
  }, 400);
});
</script>
"""


def print_pdf(zoom, tag, strip_reset):
    """按指定缩放打一份 PDF，返回 (页数, 页宽pt, 页高pt, 文本长度, 文本) 或 None。"""
    html = open(SRC, encoding="utf-8").read()
    if strip_reset:
        n = html.count(RESET_DECL)
        # 剥离失败会让 RED 对照退化成与正常组完全相同 —— 必须显式拦下，否则
        # 会得出「zoom 不影响打印」的错误结论
        if n != 1:
            raise SystemExit("!! 剥离打印复位规则失败：源码里找到 %d 处 '%s'（期望 1 处）" % (n, RESET_DECL))
        html = html.replace(RESET_DECL, "")
    idx = html.rfind("</body>")
    assert idx != -1, "找不到 </body>"
    patched = html[:idx] + (SETUP % (BODY_MARK, zoom)) + "\n" + html[idx:]

    hp = os.path.join(REPO, "_t_zoomprint_%s.html" % tag)
    pp = os.path.join(REPO, "_t_zoomprint_%s.pdf" % tag)
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
        info = (d.page_count, round(d[0].rect.width, 1), round(d[0].rect.height, 1), len(text))
        d.close()
        return info, text
    finally:
        for f in (hp, pp):
            try: os.remove(f)
            except OSError: pass


print("=" * 68)
print("纸面缩放 · 打印隔离检查 —", os.path.basename(BROWSER))
print("=" * 68)

base, base_text = print_pdf("1", "100", False)
zoom2, zoom2_text = print_pdf("2", "200", False)
red, _ = print_pdf("2", "red", True)

if base is None or zoom2 is None or red is None:
    print("PDF 未生成，无法判定")
    sys.exit(1)

print("100%%          : 页数=%d  页面=%.0fx%.0fpt  正文字符=%d" % base)
print("200%%（有复位）: 页数=%d  页面=%.0fx%.0fpt  正文字符=%d" % zoom2)
print("200%%（剥掉复位，RED 对照）: 页数=%d  页面=%.0fx%.0fpt  正文字符=%d" % red)
print("-" * 68)

body_ok = BODY_MARK in (base_text or "") and BODY_MARK in (zoom2_text or "")
print("阳性对照（正文确实打出来了）:", body_ok, " <- False 则测试无效")
print("RED 对照是否确实不同      :", red != base, " <- 期望 True；若 False 说明 zoom 不影响打印，复位规则是冗余的")
same = base == zoom2
print("200% 与 100% 打印结果一致 :", same, " <- 期望 True")
print("-" * 68)

if not body_ok:
    print("!! 正文没打进 PDF，测试无效")
if red == base:
    print("!! 前提不成立：打印介质里 zoom 本就不生效。")
    print("   那么 @media print 里的 --folio-zoom 复位规则与这条断言都是空转 —— 应当删掉两者，")
    print("   而不是保留一个无法验证的改动。")
ok = body_ok and same and (red != base)
print("结论:", "通过：纸面缩放不会渗进打印，且该结论已被 RED 对照证明有效" if ok else "未通过")
print("=" * 68)
sys.exit(0 if ok else 1)
