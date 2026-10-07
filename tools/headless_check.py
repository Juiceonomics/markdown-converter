# 可复用的无头浏览器校验：加载 index.html，注入 JS，回传注入脚本打印的结果。
# 注入脚本需自行输出以 FAIL 开头的行表示失败；本脚本据此决定退出码（有 FAIL → 1）。
#
# 用例文件里可以写 `//@PRE` 分隔：
#   `//@PRE` 之前的内容注入到**应用脚本之前**（迁移测试必须在应用启动前
#   把遗留数据塞进 localStorage，否则测不到迁移路径）；
#   之后的内容注入到 `</body>` 之前。
#
# 走 loopback HTTP + 一次性 profile + 结果 POST 回传，原因见 tools/harness.py 顶部注释。
#
# 用法: python tools/headless_check.py <注入JS文件>
#   换浏览器: FOLIO_BROWSER="...msedge.exe" python tools/headless_check.py tools/case_x.js
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(inject_js):
    # 回传的就是 ZZBEGIN/ZZEND 之间的内容本身（已在页面里剥好），直接用
    out, err = harness.run_case(REPO, inject_js)
    if out is None:
        return "(未捕获结果) 页面没有回传结果\n" + (err or "")
    return out


if __name__ == "__main__":
    result = run(open(sys.argv[1], encoding="utf-8").read())
    print(result)
    # 有 FAIL 行、或根本没捕获到结果 → 以非零码退出，让调用方能真正判定失败
    failed = re.search(r'^FAIL ', result, re.M) or result.startswith("(未捕获结果)")
    sys.exit(1 if failed else 0)
