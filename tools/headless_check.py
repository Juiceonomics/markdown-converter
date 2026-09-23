# 可复用的无头 Chrome 校验：加载 index.html，注入 JS，回传注入脚本打印的结果。
# 注入脚本需自行输出以 FAIL 开头的行表示失败；本脚本据此决定退出码（有 FAIL → 1）。
# 用法: python tools/headless_check.py <注入JS文件>
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
    out = run(open(sys.argv[1], encoding="utf-8").read())
    print(out)
    # 有 FAIL 行、或根本没捕获到结果 → 以非零码退出，让调用方能真正判定失败
    failed = re.search(r'^FAIL ', out, re.M) or out.startswith("(未捕获结果)")
    sys.exit(1 if failed else 0)
