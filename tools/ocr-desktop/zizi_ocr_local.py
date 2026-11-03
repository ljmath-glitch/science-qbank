"""茲茲 OCR 本機程式：在使用者自己的電腦跑 OCR 與題庫 Excel，考卷不離開這台電腦。

只監聽 127.0.0.1，只接受題庫網站來的請求；一次跑一份，其餘排隊。
API 與 exam-answer-key-formatter/local-app 的 /api/py-ocr/* 相同，自動匯題頁不用分兩套。
"""
import json
import os
import queue
import secrets
import shutil
import sys
import tempfile
import threading
import time
import traceback
from base64 import b64decode
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

VERSION = "1.0.1"
PORT = int(os.environ.get("ZIZI_OCR_PORT", "18787"))   # 不用 8787：那是 OCR 主機的埠，有的電腦把它對外開放
HOST = "127.0.0.1"
MAX_BODY = 100 * 1024 * 1024
JOB_TTL = 24 * 3600   # 考卷含學生資料，不留超過一天
ALLOWED_ORIGINS = {"https://science-qbank.vercel.app"} | {
    o.strip() for o in os.environ.get("OCR_ALLOWED_ORIGINS", "").split(",") if o.strip()}

BASE = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("OCR_MODELS_DIR", os.path.join(BASE, "models"))
os.environ.setdefault("EXAM_TEMPLATE", os.path.join(BASE, "assets", "template.docx"))
os.environ["OCR_PROGRESS"] = "1"
os.environ["OCR_SKIP_CLEAN"] = "1"   # 清稿在瀏覽器做完了；這裡只做 OCR

JOBS_DIR = os.path.join(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(), "ZiziOCR", "jobs")
jobs = {}
work = queue.Queue()


def job_dir(job):
    return os.path.join(JOBS_DIR, job)


def result_dir(job):
    return os.path.join(job_dir(job), "result")


def worker():
    import pyexam
    while True:
        job, source = work.get()
        state = jobs[job]
        state["status"] = "running"
        try:
            r = pyexam.process(source, result_dir(job), dpi=350)
            state["txt"] = os.path.basename(r["txt"])
            state["status"] = "done"
        except Exception:
            traceback.print_exc()
            state["error"] = traceback.format_exc()[-500:]
            state["status"] = "error"
        finally:
            try:
                os.remove(source)
            except OSError:
                pass


def clean_old_jobs():
    if not os.path.isdir(JOBS_DIR):
        return
    for name in os.listdir(JOBS_DIR):
        path = os.path.join(JOBS_DIR, name)
        if time.time() - os.path.getmtime(path) > JOB_TTL:
            shutil.rmtree(path, ignore_errors=True)


def read_events(job):
    try:
        with open(os.path.join(result_dir(job), "progress.jsonl"), encoding="utf-8") as f:
            return [{"message": e.get("msg", ""), "stage": e.get("stage"), "page": e.get("page"), "pages": e.get("pages")}
                    for e in map(json.loads, filter(None, f.read().splitlines()))]
    except OSError:
        return []


def job_result(job, state):
    txt = state.get("txt")
    text = ""
    if txt:
        with open(os.path.join(result_dir(job), txt), encoding="utf-8") as f:
            text = f.read()
    return {"ok": True, "job": job, "text": text, "log": "", "stats": {}, "reviewText": "", "reviewUrl": None,
            "figures": [], "docxUrl": None, "txtUrl": f"/api/py-ocr/download?job={job}&kind=txt",
            "qbankUrl": f"/api/py-ocr/qbank-xlsx?job={job}"}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def cors(self):
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self.send_json(403, {"ok": False, "error": "此網頁來源未獲准連線本機程式"}, cors=False)
            return False
        return True

    def send_common(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Expose-Headers", "content-disposition")

    def send_json(self, code, obj, cors=True):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if cors:
            self.send_common()
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path, content_type, filename):
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_common()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if origin not in ALLOWED_ORIGINS:
            self.send_response(403)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(204)
        self.send_common()
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Max-Age", "600")
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def known_job(self, query):
        job = (query.get("job") or [""])[0]
        return job if job in jobs else None

    def do_GET(self):
        if not self.cors():
            return
        url = urlparse(self.path)
        query = parse_qs(url.query)
        if url.path == "/api/health":
            return self.send_json(200, {"ok": True, "service": "tzutzu-ocr", "host": "本機", "revision": VERSION,
                                        "ocrEngine": "PP-OCRv5（本機）", "capabilities": ["ocr", "qbank-xlsx"]})
        job = self.known_job(query)
        if not job:
            return self.send_json(404, {"ok": False, "error": "找不到這筆工作"})
        state = jobs[job]
        if url.path == "/api/py-ocr/progress":
            since = max(0, int((query.get("since") or ["0"])[0] or 0))
            events = read_events(job)[since:]
            next_i = since + len(events)
            if state["status"] == "error":
                return self.send_json(200, {"ok": False, "events": events, "next": next_i, "done": True, "error": state["error"]})
            if state["status"] != "done":
                if state["status"] == "queued" and not events:
                    events = [{"message": "排隊中，前一份考卷跑完就開始"}]
                    return self.send_json(200, {"ok": True, "events": events, "next": since, "done": False})
                return self.send_json(200, {"ok": True, "events": events, "next": next_i, "done": False})
            return self.send_json(200, {**job_result(job, state), "events": events, "next": next_i, "done": True})
        if url.path == "/api/py-ocr/download" and state.get("txt"):
            return self.send_file(os.path.join(result_dir(job), state["txt"]), "text/plain; charset=utf-8", state["txt"])
        if url.path == "/api/py-ocr/qbank-xlsx" and state.get("txt"):
            import to_qbank_xlsx
            name = os.path.splitext(state["txt"])[0]
            out = os.path.join(job_dir(job), "qbank.xlsx")
            try:
                to_qbank_xlsx.write(to_qbank_xlsx.rows(result_dir(job), name), out)
            except Exception:
                traceback.print_exc()
                return self.send_json(500, {"ok": False, "error": "題庫 Excel 產生失敗：" + traceback.format_exc()[-400:]})
            return self.send_file(out, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", name + "_題庫.xlsx")
        self.send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        if not self.cors():
            return
        if urlparse(self.path).path != "/api/py-ocr/start":
            return self.send_json(404, {"ok": False, "error": "Not found"})
        size = int(self.headers.get("Content-Length") or 0)
        if size > MAX_BODY:
            return self.send_json(413, {"ok": False, "error": "檔案太大"})
        body = json.loads(self.rfile.read(size) or b"{}")
        if not body.get("dataBase64"):
            return self.send_json(400, {"ok": False, "error": "缺少考卷檔案"})
        filename = os.path.basename(str(body.get("filename") or "考卷.pdf"))
        if os.path.splitext(filename)[1].lower() not in (".pdf", ".png", ".jpg", ".jpeg"):
            return self.send_json(400, {"ok": False, "error": "只接受 PDF、PNG 或 JPG 檔案"})
        job = secrets.token_hex(12)
        os.makedirs(result_dir(job))
        source = os.path.join(job_dir(job), filename)
        with open(source, "wb") as f:
            f.write(b64decode(body["dataBase64"]))
        jobs[job] = {"status": "queued"}
        work.put((job, source))
        self.send_json(200, {"ok": True, "jobId": job})


def main():
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    clean_old_jobs()
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        print(f"埠 {PORT} 已被占用：茲茲 OCR 本機程式可能已經開著了。")
        input("按 Enter 關閉…")
        return
    threading.Thread(target=worker, daemon=True).start()
    print(f"茲茲 OCR 本機程式 {VERSION} 已啟動。")
    print("使用時請保持這個視窗開著；回到題庫網頁，把 OCR 運算主機選「本機」。")
    print("考卷只在這台電腦處理，暫存檔一天後自動刪除。")
    server.serve_forever()


if __name__ == "__main__":
    main()
