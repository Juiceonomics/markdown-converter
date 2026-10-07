# 无头测试的共用底座：起一个 loopback HTTP 服务、把页面结果回收回来、用一次性 profile 隔离。
#
# 为什么必须这么改（两条都是实测出来的，不是推测）：
#
#  1. **file:// 下 IndexedDB 打不开。** 探针实测：`typeof indexedDB === 'object'`，
#     但 `indexedDB.open()` 既不回调 onsuccess 也不回调 onerror —— 永远挂着。
#     结果是应用静默退回 localStorage，新写的存储层在测试里等于一次都没跑到。
#     换成 http://127.0.0.1 后 IDB 正常（同时也更贴近生产：线上是 https）。
#
#  2. **--virtual-time-budget 与 IndexedDB 天然冲突。** 虚拟时间只在任务队列空时推进，
#     而 IDB 的回调来自另一个线程：虚拟时间会瞬间跑完整个预算，IDB 回调一次都没机会执行。
#     所以这里**不设虚拟时间**，改为页面跑完后把结果 POST 回 `/__zz`，服务端等这个 POST。
#     （打印类检查不需要 IDB，仍可留在 file:// + 虚拟时间。）
#
# 3. **必须用一次性 --user-data-dir。** 一旦 IDB 成为权威存储，各用例开头那句
#     `localStorage.clear()` 就不再等于「干净状态」了：残留的 IDB 会让每个用例都
#     恢复出旧标签，静默污染断言。一个临时 profile 一次性解决全部用例。
import functools
import http.server
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading

BROWSER = os.environ.get("FOLIO_BROWSER") or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
WINDOW = "1920,1080"
RESULT_PATH = "/__zz"

# 结果回收器：等页面里出现带 ZZBEGIN 标记的结果块，就把它 POST 回来。
# 挂在每个用例后面注入，这样已有的 case_*.js 一行都不用改。
#
# 两个刻意的选择：
#   · 不去按 id 找容器 —— 各用例的写法并不统一（有的建 <pre id="zz-results">，
#     有的只 appendChild 一个裸 <pre>），按 id 找会漏掉后者，表现为「等结果超时」。
#   · 只扫真正的 <pre> 元素，不去 regex document.documentElement.innerHTML ——
#     用例自己的 <script> 源码里就含字面量 'ZZBEGIN\n'，扫整篇 HTML 会命中脚本源码，
#     拿到一个假的「结果」。querySelectorAll('pre') 天然排除了脚本文本。
#   · 取最后一个匹配：结果块是用例最后 append 到 body 的。
WATCHER = """
<script>
(function () {
  var t0 = Date.now();
  var iv = setInterval(function () {
    var pres = document.querySelectorAll('pre');
    for (var i = pres.length - 1; i >= 0; i--) {
      var m = /ZZBEGIN\\n([\\s\\S]*?)\\nZZEND/.exec(pres[i].textContent);
      if (m) { clearInterval(iv); fetch('%s', { method: 'POST', body: m[1] }); return; }
    }
    if (Date.now() - t0 > 45000) {
      clearInterval(iv);
      fetch('%s', { method: 'POST', body: '(未捕获结果) 等待结果超时' });
    }
  }, 80);
})();
</script>
""" % (RESULT_PATH, RESULT_PATH)


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.path != RESULT_PATH:
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n)
        self.server.zz_result = body.decode("utf-8", "replace")
        self.server.zz_event.set()
        self.send_response(200)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"ok")


class _Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def start(repo):
    """在随机端口起一个静态服务（根目录 = 仓库根），并挂上结果回收端点。"""
    handler = functools.partial(_Handler, directory=repo)
    srv = _Server(("127.0.0.1", 0), handler)
    srv.zz_event = threading.Event()
    srv.zz_result = None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def url_of(srv, name):
    return "http://127.0.0.1:%d/%s" % (srv.server_address[1], name)


def stop(srv):
    try:
        srv.shutdown()
    except Exception:
        pass
    try:
        srv.server_close()
    except Exception:
        pass


def kill(proc):
    try:
        proc.kill()
    except Exception:
        pass
    if sys.platform == "win32":
        # Chrome 会派生一堆子进程；只 kill 主进程会留下孤儿
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                           capture_output=True, timeout=20)
        except Exception:
            pass
    try:
        proc.wait(timeout=15)
    except Exception:
        pass


def run_case(repo, inject_js, pre_js=None, timeout=120):
    """把一个用例注入 index.html，跑一遍，返回 (结果文本, 失败时的诊断)。
    用例文件里可写 `//@PRE` 分隔：在此之前的内容注入到**应用脚本之前**
    （迁移测试必须在应用启动前把遗留数据塞进 localStorage），之后的内容注入到 </body> 前。
    """
    srv = start(repo)
    profile = tempfile.mkdtemp(prefix="folio-test-")
    page = os.path.join(repo, "_t_check.html")
    proc = None
    try:
        html = open(os.path.join(repo, "index.html"), encoding="utf-8").read()
        post = inject_js
        pre = pre_js
        if pre_js is None:
            # 只认「单独占一行」的 //@PRE。用 str.split 会命中用例注释里提到的
            # `//@PRE` 字样（本文件顶部的说明里就写了），于是真正的预置代码被划到后置，
            # 迁移测试静默失效 —— 表现为「等结果超时」，完全看不出根因。
            m = re.search(r"(?m)^[ \t]*//@PRE[ \t]*$", inject_js)
            if m:
                pre, post = inject_js[:m.start()], inject_js[m.end():]
        # 后置：注入到最后一个 </body> 之前。源码里可能有多处 <body>（CSS 注释、模板串），
        # 用 replace("<body>", …) 会命中最前面那处，曾因此在注释里注入、脚本静默失效。
        idx = html.rfind("</body>")
        assert idx != -1, "找不到 </body>"
        # 前置锚点必须在**原始** html 上算：改过之后的字符串里，
        # 最后那个 <script> 已经是我们刚加进去的后置块/回收器了，前置代码会被插到应用之后。
        # （之前正是这个错，预置数据只因为「同步写 localStorage」跑赢异步的存储水合才侥幸生效。）
        aidx = html.rfind("<script>")
        assert 0 <= aidx < idx, "找不到应用 <script>"
        patched = html[:idx] + "<script>\n" + post + "\n</script>\n" + WATCHER + "\n" + html[idx:]
        if pre:
            patched = patched[:aidx] + "<script>\n" + pre + "\n</script>\n" + patched[aidx:]
        open(page, "w", encoding="utf-8").write(patched)

        proc = subprocess.Popen(
            [BROWSER, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--no-first-run", "--no-default-browser-check",
             "--user-data-dir=" + profile, "--window-size=" + WINDOW,
             url_of(srv, "_t_check.html")],
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if srv.zz_event.wait(timeout=timeout):
            return srv.zz_result, ""
        kill(proc)
        try:
            err = (proc.stderr.read() or b"").decode("utf-8", "replace")
        except Exception:
            err = ""
        return None, err[-2000:]
    finally:
        if proc:
            kill(proc)
        try:
            os.remove(page)
        except OSError:
            pass
        stop(srv)
        shutil.rmtree(profile, ignore_errors=True)
