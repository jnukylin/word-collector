# -*- coding: utf-8 -*-
"""本地测试服务器：给所有响应加 no-store，避免浏览器缓存模块干扰调试。
运行：python tools/serve_test.py [port]（在项目根目录下执行）
"""
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = HTTPServer(("127.0.0.1", port), partial(NoCacheHandler, directory="."))
    print(f"serving on http://127.0.0.1:{port}/ (no-cache)")
    server.serve_forever()
