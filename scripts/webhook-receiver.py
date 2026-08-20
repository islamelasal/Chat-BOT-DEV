#!/usr/bin/env python3
"""مستقبِل Webhook محلي للاختبار — يتحقق من توقيع HMAC-SHA256 ويسجل الرزم.

الاستخدام:
  python3 scripts/webhook-receiver.py [port] [secret]

المسارات:
  POST /        → يتحقق من التوقيع ويسجل الرزمة، يرد 200 دائماً
  POST /always-fail → يرد 500 دائماً (لاختبار إعادة المحاولة)
  GET  /log     → قائمة الرزم المستقبَلة (JSON)
  GET  /clear   → مسح السجل
  POST /fail-once → يرد 500 مرة واحدة ثم 200 (لاختبار محاولة ثانية ناجحة)
"""
import hashlib
import hmac
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime, timezone

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4601
SECRET = sys.argv[2] if len(sys.argv) > 2 else ''
LOG = []
FAIL_ONCE = {'armed': False}
LOCK = threading.Lock()


def verify(body: bytes, ts: str, signature: str) -> bool:
    if not SECRET:
        return True
    if not signature.startswith('sha256=') or not ts:
        return False
    expected = 'sha256=' + hmac.new(SECRET.encode(), f'{ts}.'.encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        event = self.headers.get('X-CBD-Event', '')
        sig_ok = verify(body, self.headers.get('X-CBD-Signature-Timestamp', ''), self.headers.get('X-CBD-Signature', ''))
        entry = {
            'at': datetime.now(timezone.utc).isoformat(),
            'event': event,
            'signature_ok': sig_ok,
            'body': body.decode('utf-8', 'replace')[:2000],
        }
        with LOCK:
            LOG.append(entry)
        if self.path == '/always-fail':
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b'boom')
            return
        if self.path == '/fail-once':
            with LOCK:
                armed = FAIL_ONCE['armed']
                FAIL_ONCE['armed'] = False
            if armed:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b'once')
                return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps({'ok': True, 'event': event, 'sig_ok': sig_ok}).encode())

    def do_GET(self):
        if self.path == '/log':
            with LOCK:
                payload = json.dumps(LOG, ensure_ascii=False).encode()
        elif self.path == '/clear':
            with LOCK:
                LOG.clear()
            payload = b'{"ok":true}'
        elif self.path == '/arm-fail-once':
            with LOCK:
                FAIL_ONCE['armed'] = True
            payload = b'{"armed":true}'
        else:
            payload = b'{"ok":true,"note":"receiver"}'
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    srv = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f'receiver on :{PORT} secret={"set" if SECRET else "none"}', flush=True)
    srv.serve_forever()
