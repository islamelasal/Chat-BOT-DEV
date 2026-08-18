#!/usr/bin/env python3
"""
Chat Bot Dev — زاحف Scrapling المصغّر (خدمة جانبية)
====================================================
يستقبل POST /crawl {url} ويعيد {ok, html, title, engine}.

سلسلة تدرّج هندسي (Layered Fallback):
  1) StealthyFetcher (متصفح stealth) — يتخطى Cloudflare Turnstile/Interstitial
     وهو الحل لمواقع مثل elshawwa.com المحمية بـ Cloudflare.
  2) Fetcher (HTTPX ببصمة متصفح) — سريع وخفيف بلا متصفح.
  3) urllib عادي — كملاذ أخير.

إن لم تكن الخدمة متاحة، عقدة NestJS تسقط تلقائياً لزاحفها المدمج.
التشغيل: python main.py [المنفذ]  (الافتراضي 4100)
"""
import json
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

# استيراد كسول — حتى تعمل الخدمة حتى لو لم تُثبَّت ملحقات المتصفح
_FETCHER_OK = True
try:
    from scrapling.fetchers import Fetcher, StealthyFetcher
except Exception:  # pragma: no cover
    _FETCHER_OK = False


def fetch_with_scrapling(url: str):
    """يجرّب stealth ثم HTTPX ويعيد (html, title, engine) أو يرمي"""
    if _FETCHER_OK:
        # 1) المتصفح الخفي — تجاوز الحماية
        try:
            page = StealthyFetcher.fetch(url, headless=True, timeout=30_000)
            html = getattr(page, "html_content", None) or getattr(page, "body", None) or ""
            title = ""
            try:
                title = page.css_first("title::text") or ""
            except Exception:
                pass
            if html:
                return html, title, "stealthy"
        except Exception:
            pass
        # 2) HTTPX ببصمة متصفح
        try:
            page = Fetcher.get(url, stealthy_headers=True)
            html = getattr(page, "html_content", None) or ""
            title = ""
            try:
                title = page.css_first("title::text") or ""
            except Exception:
                pass
            if html:
                return html, title, "httpx"
        except Exception:
            pass
    # 3) urllib ملاذ أخير
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ChatBotDevCrawler/2.0"},
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        raw = res.read().decode("utf-8", errors="replace")
    title = ""
    if "<title" in raw:
        title = raw.split("<title", 1)[1].split(">", 1)[1].split("</title>", 1)[0].strip()
    return raw, title, "urllib"


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            url = str(body.get("url", "")).strip()
            if not url.startswith(("http://", "https://")):
                resp = {"ok": False, "error": "رابط غير صالح"}
            else:
                try:
                    html, title, engine = fetch_with_scrapling(url)
                    resp = {"ok": True, "html": html[:2_000_000], "title": title, "engine": engine}
                except Exception as exc:  # pragma: no cover
                    resp = {"ok": False, "error": str(exc)[:300]}
        except Exception as exc:  # pragma: no cover
            resp = {"ok": False, "error": str(exc)[:300]}
        data = json.dumps(resp, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        data = b'{"ok":true,"service":"chat-bot-dev-scrapling"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):  # صمت
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4100
    print(f"🕷️ Scrapling crawler جاهز على المنفذ {port}")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
