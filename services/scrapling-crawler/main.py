#!/usr/bin/env python3
"""
Chat Bot Dev — زاحف Scrapling v2 (خدمة جانبية)
=================================================
تطبيق تقنيات مدروسة من كود Scrapling (★75K) كطبقة اتصال خلفية لخدمتنا:

1) سلم محركات بتصعيد ذكي (Engine Ladder):
   http (curl_cffi ببصمة TLS لمتصفح عشوائي) → stealth (متصفح خفي يحل Cloudflare)
   → urllib (ملاذ أخير). الطلب العادي يبدأ بالأرخص، والحجب يصعّد تلقائياً.

2) كشف الحجب (Blocked Detection) — كما في Scrapling:
   أكواد {401,403,407,429,444,500,502,503,504} + بصمات محتوى
   ("Just a moment...", "access denied", "captcha", "rate limit"...).

3) خنق تلقائي لكل دومين (AutoThrottle-lite):
   تأخير أدنى بين الطلبات لنفس الدومين، يُضاعف عند الحجب، ويحترم Retry-After،
   ويعود تدريجياً عند الاستقرار — نزور مواقع العملاء بلطف ولا نتسبب في حجبنا.

4) جلسات دائمة لكل دومين (FetcherSession): كعكات وحالة بين الطلبات.

5) نقاط: GET /healthz (حالة المحركات) · POST /crawl {url, strategy?}
"""
import json
import random
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

# استيراد كسول — تعمل الخدمة حتى بدون ملحقات المتصفح
FETCHER_OK = False
try:
    from scrapling.fetchers import Fetcher, FetcherSession, StealthyFetcher
    FETCHER_OK = True
except Exception:  # pragma: no cover
    pass

# كشف جاهزية المتصفح الخفي (camoufox) — يمنع الانتظار الطويل عندما يكون غير مثبت
STEALTH_READY = False
if FETCHER_OK:
    try:
        import os as _os
        _camoufox_paths = [
            _os.path.expanduser("~/.cache/camoufox"),
            _os.path.expanduser("~/.camoufox"),
            _os.path.expanduser("~/.cache/camoufox/downloads"),
            "/root/.cache/camoufox",
        ]
        STEALTH_READY = any(_os.path.isdir(p) for p in _camoufox_paths)
    except Exception:  # pragma: no cover
        STEALTH_READY = False

BLOCKED_STATUS = {401, 403, 407, 429, 444, 500, 502, 503, 504}
BLOCKED_MARKERS = [
    "just a moment", "access denied", "cf-browser-verification", "captcha",
    "rate limit", "sorry, you have been blocked", "verify you are human",
    "challenge-platform", "attention required", "enable javascript",
]
BROWSER_FINGERPRINTS = ["chrome", "firefox", "safari", "edge"]
MAX_HTML = 2_000_000
# رؤوس جلب فيدات (RSS/XML/CSV) — مواقع CS-Cart تعاملها كطلب بيانات لا صفحة
FEED_HEADERS = {
    "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, text/csv;q=0.7, */*;q=0.5",
    "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.6",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
}

# ─────────────────────────── خنق تلقائي لكل دومين ───────────────────────────

class DomainThrottle:
    """نسخة عملية من AutoThrottle: تأخير أدنى + مضاعفة عند الحجب + Retry-After"""

    def __init__(self, start: float = 1.0, max_delay: float = 30.0):
        self.start = start
        self.max_delay = max_delay
        self._lock = threading.Lock()
        self._delays: dict = {}
        self._last: dict = {}

    def wait(self, domain: str) -> None:
        with self._lock:
            delay = self._delays.get(domain, self.start)
            last = self._last.get(domain, 0.0)
        remain = last + delay - time.time()
        if remain > 0:
            time.sleep(min(remain, self.max_delay))

    def record(self, domain: str, ok: bool, latency: float, retry_after=None) -> None:
        with self._lock:
            delay = self._delays.get(domain, self.start)
            if retry_after is not None and retry_after > 0:
                delay = min(max(retry_after, self.start), self.max_delay)  # احترام الخادم
            elif not ok:
                delay = min(delay * 2, self.max_delay)                      # حجب → مضاعفة
            else:
                # استقرار → نعود تدريجياً نحو تأخير متناسب مع زمن الاستجابة
                target = max(self.start, latency / 4.0)
                delay = max(self.start, min(delay * 0.7 + target * 0.3, self.max_delay))
            self._delays[domain] = delay
            self._last[domain] = time.time()

    def stats(self) -> dict:
        with self._lock:
            return {d: round(v, 2) for d, v in self._delays.items()}

THROTTLE = DomainThrottle()

# ─────────────────────────── جلسات دائمة لكل دومين ───────────────────────────

_sessions: dict = {}
_sessions_lock = threading.Lock()
MAX_SESSIONS = 20

def get_session(domain: str):
    """جلسة FetcherSession (كعكات دائمة) ببصمة متصفح عشوائية — كما يفعل Scrapling"""
    with _sessions_lock:
        if domain in _sessions:
            return _sessions[domain]
        if len(_sessions) >= MAX_SESSIONS:
            oldest = next(iter(_sessions))
            _sessions.pop(oldest, None)
        if FETCHER_OK:
            try:
                s = FetcherSession(impersonate=random.choice(BROWSER_FINGERPRINTS))
                _sessions[domain] = s
                return s
            except Exception:
                pass
        return None

# ─────────────────────────── كشف الحجب ───────────────────────────

def is_blocked(status: int | None, body: str) -> bool:
    if status is not None and status in BLOCKED_STATUS:
        return True
    low = (body or "").lower()
    return any(m in low for m in BLOCKED_MARKERS)

def parse_retry_after(headers) -> float | None:
    try:
        v = headers.get("Retry-After")
        if not v:
            return None
        if v.strip().isdigit():
            return float(v)
        return None  # صيغ التاريخ النادرة نتجاهلها بأمان
    except Exception:
        return None

# ─────────────────────────── المحركات ───────────────────────────

def fetch_http(url: str, timeout: int, headers: dict | None = None) -> tuple[str | None, int | None, str, dict]:
    """المحرك الثابت: بصمة TLS متصفح + رؤوس حقيقية (الترتيب يولده curl_cffi)"""
    if not FETCHER_OK:
        return None, None, "", {}
    hdrs = headers or {}
    try:
        session = get_session(urlparse(url).netloc)
        if session is None:
            page = Fetcher.get(url, stealthy_headers=True, headers=hdrs or None, timeout=timeout)
        else:
            page = session.get(url, stealthy_headers=True, headers=hdrs or None, timeout=timeout)
        html = getattr(page, "html_content", None) or ""
        return html, getattr(page, "status", 200), url, {}
    except Exception as exc:
        return None, None, str(exc)[:200], {}

def fetch_stealth(url: str, timeout: int) -> tuple[str | None, int | None, str, dict]:
    """المتصفح الخفي — يحل تحديات Cloudflare (انتظار + نقرة بشرية داخلية)"""
    if not FETCHER_OK:
        return None, None, "", {}
    try:
        page = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
            solve_cloudflare=True,
            timeout=max(timeout, 45_000),
        )
        html = getattr(page, "html_content", None) or ""
        return html, getattr(page, "status", 200), url, {}
    except Exception as exc:
        return None, None, str(exc)[:200], {}

def fetch_googlebot(url: str, timeout: int) -> tuple[str | None, int | None, str, dict]:
    """محاولة بهوية Googlebot — بعض المتاجر تسمح للزاحف الرسمي حيث تحجب غيره"""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Accept": FEED_HEADERS["Accept"],
            "Accept-Language": "en,ar;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            try:
                html = raw.decode("utf-8", errors="replace")
            except Exception:
                html = raw.decode("latin-1", errors="replace")
            return html, res.status, url, {}
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        return body, e.code, url, {}
    except Exception as exc:
        return None, None, str(exc)[:200], {}

def fetch_urllib(url: str, timeout: int) -> tuple[str | None, int | None, str, dict]:
    """ملاذ أخير — طلب عادي بلا بصمة"""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.6",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            charset = res.headers.get_content_charset() or "utf-8"
            try:
                html = raw.decode(charset, errors="replace")
            except Exception:
                html = raw.decode("utf-8", errors="replace")
            return html, res.status, url, {}
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        return body, e.code, url, {}
    except Exception as exc:
        return None, None, str(exc)[:200], {}

def engine_ladder(url: str, strategy: str, timeout: int) -> dict:
    """سلم المحركات مع كشف الحجب والتصعيد التلقائي — فلسفة Scrapling في الحجب"""
    domain = urlparse(url).netloc
    THROTTLE.wait(domain)
    order = []
    if strategy == "stealth":
        order = [fetch_stealth, fetch_http, fetch_googlebot, fetch_urllib]
    elif STEALTH_READY:
        order = [fetch_http, fetch_stealth, fetch_googlebot, fetch_urllib]
    else:
        # المتصفح غير مثبت → لا تضيّع وقتاً في محاولته (تصعيد مباشر)
        order = [fetch_http, fetch_googlebot, fetch_urllib]

    engine_names = {
        "fetch_http": "http",
        "fetch_stealth": "stealth",
        "fetch_googlebot": "googlebot",
        "fetch_urllib": "urllib",
    }

    for attempt in range(2):  # جولة إعادة كاملة
        for engine in order:
            name = engine_names.get(engine.__name__, engine.__name__)
            started = time.time()
            # محرك http يقبل رؤوس الفيد — البقية رؤوسها مدمجة
            if engine.__name__ == "fetch_http":
                html, status, err, _ = engine(url, timeout, FEED_HEADERS)
            else:
                html, status, err, _ = engine(url, timeout)
            latency = time.time() - started
            if html is not None and not is_blocked(status, html):
                THROTTLE.record(domain, True, latency)
                return {
                    "ok": True, "engine": name, "status": status,
                    "html": html[:MAX_HTML], "title": extract_title(html),
                    "blocked": False, "latency_ms": int(latency * 1000),
                }
            # فشل أو حجب → خنّق الدومين وجرّب المحرك التالي (تصعيد)
            THROTTLE.record(domain, False, latency)
        time.sleep(1.5 + random.random() * 2.0)  # تهدئة بين الجولات

    # فشل نهائي — أعد آخر محتوى إن كان صفحة حجب واضحة (للتوثيق)
    return {"ok": False, "error": "جميع المحركات فشلت أو الموقع يحجب الطلبات", "blocked": True}

def extract_title(html: str) -> str:
    try:
        if "<title" in html:
            return html.split("<title", 1)[1].split(">", 1)[1].split("</title>", 1)[0].strip()[:200]
    except Exception:
        pass
    return ""

# ─────────────────────────── خادم HTTP ───────────────────────────

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/healthz"):
            data = json.dumps({
                "ok": True,
                "service": "chat-bot-dev-scrapling-v2",
                "engines": {"http": FETCHER_OK, "stealth": STEALTH_READY, "urllib": True},
                "throttled_domains": len(THROTTLE.stats()),
            }, ensure_ascii=False).encode("utf-8")
        else:
            data = b'{"ok":true,"service":"chat-bot-dev-scrapling-v2"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            url = str(body.get("url", "")).strip()
            strategy = str(body.get("strategy", "auto")).strip()
            if strategy not in ("auto", "http", "stealth"):
                strategy = "auto"
            timeout = min(int(body.get("timeout_ms", 30000) or 30000), 90000)
            if not url.startswith(("http://", "https://")):
                resp = {"ok": False, "error": "رابط غير صالح"}
            else:
                resp = engine_ladder(url, strategy, timeout)
        except Exception as exc:  # pragma: no cover
            resp = {"ok": False, "error": str(exc)[:300]}
        data = json.dumps(resp, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):  # صمت (سجلات عبر إخراج قياسي عند الحاجة)
        pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4100
    print(f"🕷️ Scrapling v2 جاهز على المنفذ {port} (محاور http/stealth/urllib + حجب + خنق)")
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
