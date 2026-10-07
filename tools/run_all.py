# 一键在 Chrome 与 Edge 上跑全部检查。
# 用法: python tools/run_all.py
# 退出码：任一浏览器任一检查失败即为 1。
import glob, os, subprocess, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(REPO, "tools")

BROWSERS = [
    ("Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    ("Edge", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
]

cases = sorted(os.path.basename(p) for p in glob.glob(os.path.join(TOOLS, "case_*.js")))
failed = []

for label, exe in BROWSERS:
    if not os.path.exists(exe):
        print("[跳过] %s 未安装：%s" % (label, exe))
        continue
    print("=" * 70)
    print("浏览器：%s  (%s)" % (label, exe))
    print("=" * 70)
    env = dict(os.environ, FOLIO_BROWSER=exe, PYTHONIOENCODING="utf-8")

    for c in cases:
        r = subprocess.run([sys.executable, os.path.join(TOOLS, "headless_check.py"),
                            os.path.join(TOOLS, c)],
                           capture_output=True, text=True, env=env,
                           encoding="utf-8", errors="replace", timeout=300)
        out = r.stdout or ""
        p = out.count("\nPASS ") + (1 if out.startswith("PASS ") else 0)
        f = out.count("\nFAIL ") + (1 if out.startswith("FAIL ") else 0)
        ok = (r.returncode == 0)
        if not ok:
            failed.append("%s / %s" % (label, c))
        print("  %-22s %2d PASS  %d FAIL  %s" % (c, p, f, "OK" if ok else "失败"))

    for tool in ("print_check.py", "print_doc_check.py"):
        r = subprocess.run([sys.executable, os.path.join(TOOLS, tool)],
                           capture_output=True, text=True, env=env,
                           encoding="utf-8", errors="replace", timeout=300)
        ok = (r.returncode == 0)
        if not ok:
            failed.append("%s / %s" % (label, tool))
        body = [l for l in (r.stdout or "").split("\n") if "结论" in l]
        print("  %-22s %s" % (tool, body[-1].strip() if body else "无输出"))
    print("")

print("=" * 70)
if failed:
    print("失败项：")
    for x in failed:
        print("  -", x)
    sys.exit(1)
print("全部通过：Chrome 与 Edge 上所有检查均无失败")
sys.exit(0)
