#!/usr/bin/env python3
"""خادم فيدات اختبار — يحاكي سيناريوهات حقيقية لاختبار طبقة الاتصال"""
import gzip
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

CSV_UTF8 = 'id,name,category,price,list_price,url,image\n201,"لحاف قطن ملكي 240×260","المفروشات",799,1299,"https://elshawwa.com/p/201","https://elshawwa.com/i/201.jpg"\n202,"طقم سفرة 24 قطعة","الأدوات المنزلية",649,850,"https://elshawwa.com/p/202","https://elshawwa.com/i/202.jpg"\n203,"عباية صيفي حريمي","الملابس",399,0,"https://elshawwa.com/p/203","https://elshawwa.com/i/203.jpg"\n'

# نفس الفيد بترميز windows-1256 (عربي قديم)
CSV_CP1256 = CSV_UTF8.encode('windows-1256', errors='replace')

HTML_PAGE = '<!doctype html><html><head><title>مجموعة الشوا التجارية</title></head><body><h1>مرحبا</h1><p>هذه صفحة ويب وليست فيداً</p></body></html>'.encode('utf-8')

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/feed.csv':
            self._send(CSV_UTF8.encode('utf-8'), 'text/csv; charset=utf-8')
        elif path == '/feed-gzip.csv':
            self._send(gzip.compress(CSV_UTF8.encode('utf-8')), 'text/csv', content_encoding='gzip')
        elif path == '/feed-cp1256.csv':
            self._send(CSV_CP1256, 'text/csv; charset=windows-1256')
        elif path == '/blocked':
            body = b'<html><title>Just a moment...</title><body>access denied</body></html>'
            self.send_response(403)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Retry-After', '2')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path == '/html':
            self._send(HTML_PAGE, 'text/html; charset=utf-8')
        else:
            self._send(b'{"ok":true}', 'application/json')

    def _send(self, data, ctype, content_encoding=None):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        if content_encoding:
            self.send_header('Content-Encoding', content_encoding)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass

if __name__ == '__main__':
    print('🔧 خادم فيدات الاختبار على 4600')
    HTTPServer(('0.0.0.0', 4600), Handler).serve_forever()
