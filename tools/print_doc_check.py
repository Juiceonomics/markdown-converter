# 决定性检查：把 buildPrintDocHtml() 生成的那份「打印文档」单独打印出来，
# 确认正文真的出现在 PDF 里（而不是空白），且注入的类扩展元素不出现。
#
# 为什么需要它：之前的用例只断言屏幕媒体下的 visibility，漏掉了 @media print 里的
# display 规则 —— 曾导致打印文档的根容器被判 display:none、导出全空白。本检查直接
# 看最终 PDF 的文本，任何「打得出来但内容是空」的问题都会被抓到。
#
# 用法: python tools/print_doc_check.py
#   换浏览器: FOLIO_BROWSER="...msedge.exe" python tools/print_doc_check.py
import html as html_mod
import os, re, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWSER = os.environ.get("FOLIO_BROWSER") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
SRC = os.path.join(REPO, "index.html")

BODY_MARK = "ZZDOC_BODY_MARK"
EXT_MARK = "ZZDOC_EXT_OVERLAY"

INJECT = r"""
window.addEventListener('load', function () { setTimeout(function () {
  editor.innerHTML = '<h1>' + '%s' + '</h1><p>' + '这是应当出现在 PDF 里的正文内容。'.repeat(40) + '</p>';
  var doc = buildPrintDocHtml('打印文档自检');
  var pre = document.createElement('pre');
  pre.id = 'zz-doc';
  pre.textContent = doc;
  document.body.appendChild(pre);
}, 600); });
""" % BODY_MARK


def built_doc():
    src = open(SRC, encoding="utf-8").read()
    patched = src.replace("<body>", "<body>\n<script>\n" + INJECT + "\n</script>", 1)
    assert patched != src
    hp = os.path.join(REPO, "_t_bd.html")
    open(hp, "w", encoding="utf-8").write(patched)
    try:
        r = subprocess.run([BROWSER, "--headless=new", "--disable-gpu", "--no-sandbox",
                            "--virtual-time-budget=9000", "--dump-dom",
                            "file:///" + hp.replace("\\", "/")],
                           capture_output=True, timeout=180, text=True,
                           encoding="utf-8", errors="replace")
        dom = r.stdout or ""
        m = re.search(r'<pre id="zz-doc">(.*?)</pre>', dom, re.S)
        return html_mod.unescape(m.group(1)) if m else None
    finally:
        if os.path.exists(hp):
            os.remove(hp)


def print_text(doc_html):
    hp = os.path.join(REPO, "_t_bd2.html")
    pp = os.path.join(REPO, "_t_bd2.pdf")
    open(hp, "w", encoding="utf-8").write(doc_html)
    try:
        subprocess.run([BROWSER, "--headless=new", "--disable-gpu", "--no-sandbox",
                        "--no-pdf-header-footer", "--virtual-time-budget=9000",
                        "--print-to-pdf=" + pp, "file:///" + hp.replace("\\", "/")],
                       capture_output=True, timeout=180)
        if not os.path.exists(pp):
            return None, None
        import pymupdf
        d = pymupdf.open(pp)
        txt = "\n".join(p.get_text() for p in d)
        n = d.page_count
        d.close()
        return txt, n
    finally:
        for f in (hp, pp):
            try: os.remove(f)
            except OSError: pass


print("=" * 68)
print("打印文档自检 —", os.path.basename(BROWSER))
print("=" * 68)

doc = built_doc()
if not doc:
    print("无法取得 buildPrintDocHtml() 的产物"); sys.exit(1)

print("生成文档长度        :", len(doc))

# 不变量：复制过来的样式里不得残留 @media 块（它们是按应用自身 DOM 写的，会误伤打印文档）
no_media = doc.count("@media") == 0
print("样式残留 @media 块  :", doc.count("@media"), " <- 期望 0")

text, pages = print_text(doc)
if text is None:
    print("打印失败，未生成 PDF"); sys.exit(1)

body_ok = BODY_MARK in text
print("PDF 页数            :", pages)
print("阳性对照（正文在）   :", body_ok, " <- False 即为「导出空白」")

# 再验一次：模拟扩展注入到打印文档里，应被硬化规则挡住
doc2 = doc.replace("<body>", "<body>\n" + '<div style="position:fixed;top:20px;right:20px;'
                   'z-index:2147483647;background:#fff">' + EXT_MARK + '</div>', 1)
text2, _ = print_text(doc2)
ext_ok = (EXT_MARK in text2) if text2 else True
print("注入元素是否被截入   :", ext_ok, " <- 期望 False")

print("-" * 68)
ok = no_media and body_ok and not ext_ok
print("结论:", "通过：打印文档能正常输出正文，且不残留应用侧 @media 规则" if ok else "未通过")
print("=" * 68)
sys.exit(0 if ok else 1)
