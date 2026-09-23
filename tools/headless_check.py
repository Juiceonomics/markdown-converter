# 可复用的无头 Chrome 校验：加载 index.html，注入 JS，断言表达式，回传结果。
# 用法: python tools/headless_check.py <注入JS文件> <断言表达式>
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
