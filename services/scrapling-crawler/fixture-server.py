#!/usr/bin/env python3
"""خادم فيدات اختبار — يحاكي سيناريوهات حقيقية لاختبار طبقة الاتصال"""
import gzip
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

CSV_UTF8 = 'id,name,category,price,list_price,url,image,is_deal,is_bride_essential\n201,"لحاف قطن ملكي 240×260","المفروشات",799,1299,"https://elshawwa.com/p/201","https://elshawwa.com/i/201.jpg",1,0\n202,"طقم سفرة 24 قطعة","الأدوات المنزلية",649,850,"https://elshawwa.com/p/202","https://elshawwa.com/i/202.jpg",0,1\n203,"عباية صيفي حريمي","الملابس",399,0,"https://elshawwa.com/p/203","https://elshawwa.com/i/203.jpg",1,1\n204,"طقم حلل جرانيت ساڤلون 10 قطع تركي أصلي","أدوات المطبخ",6500,7800,"https://elshawwa.com/p/204","https://elshawwa.com/i/204.jpg",1,1\n205,"طقم ملايات قطن مصري 100% مطرز 5 قطع","المفروشات",3900,4500,"https://elshawwa.com/p/205","https://elshawwa.com/i/205.jpg",0,1\n206,"طقم عشاء أر بالاتين كريستال بورسلين 60 قطعة","أطقم السفرة",4500,5200,"https://elshawwa.com/p/206","https://elshawwa.com/i/206.jpg",1,1\n'

# نفس الفيد بترميز windows-1256 (عربي قديم)
CSV_CP1256 = CSV_UTF8.encode('windows-1256', errors='replace')

HTML_PAGE = '<!doctype html><html><head><title>مجموعة الشوا التجارية</title></head><body><h1>مرحبا</h1><p>هذه صفحة ويب وليست فيداً</p></body></html>'.encode('utf-8')

# فيد XML بصيغة فيد الشوا الحقيقية (نموذج حرفي من العميل)
XML_FEED = '''<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
  <title><![CDATA[مجموعة الشوا التجارية]]></title>
  <link>https://elshawwa.com</link>
  <description><![CDATA[Live SKU mapped catalog feed compiled by NTS-DEV]]></description>
<item>
  <g:id>34314</g:id>
  <g:item_group_id><![CDATA[34313]]></g:item_group_id>
  <g:mpn><![CDATA[60466002_01FA]]></g:mpn>
  <g:title><![CDATA[زجاجة مياه للاطفال مع صمام مقاوم للانسكاب 1 لتر - ألوان متنوعة]]></g:title>
  <g:description><![CDATA[زجاجة مياه للاطفال مع صمام مقاوم للانسكاب 1 لتر - ألوان متنوعة]]></g:description>
  <g:link>https://elshawwa.com/kitchen-and-home/kitchen-accessories/kids-water-bottle-1l-anti-spill/?variation_id=34314</g:link>
  <g:image_link>https://elshawwa.com/images/detailed/26/bottle.webp</g:image_link>
  <g:condition>new</g:condition>
  <g:availability>in stock</g:availability>
  <g:inventory>1</g:inventory>
  <g:price>64.00 EGP</g:price>
  <g:product_type><![CDATA[الأدوات المنزلية > رفايع المطبخ]]></g:product_type>
  <g:brand><![CDATA[مجموعة الشوا التجارية]]></g:brand>
  <g:gender><![CDATA[unisex]]></g:gender>
  <g:age_group><![CDATA[kids]]></g:age_group>
</item>
<item>
  <g:id>34315</g:id>
  <g:item_group_id><![CDATA[34313]]></g:item_group_id>
  <g:mpn><![CDATA[60466002_0E4C]]></g:mpn>
  <g:title><![CDATA[زجاجة مياه للاطفال مع صمام مقاوم للانسكاب 1 لتر - ألوان متنوعة]]></g:title>
  <g:link>https://elshawwa.com/kitchen-and-home/kitchen-accessories/kids-water-bottle-1l-anti-spill/?variation_id=34315</g:link>
  <g:availability>in stock</g:availability>
  <g:price>64.00 EGP</g:price>
  <g:product_type><![CDATA[الأدوات المنزلية > رفايع المطبخ]]></g:product_type>
  <g:brand><![CDATA[مجموعة الشوا التجارية]]></g:brand>
</item>
<item>
  <g:id>27268</g:id>
  <g:item_group_id><![CDATA[27263]]></g:item_group_id>
  <g:mpn><![CDATA[8425907]]></g:mpn>
  <g:title><![CDATA[ترينج رجالى نص كم قطن ليكرا مقاس M-5XL (موديل 20806)]]></g:title>
  <g:link>https://elshawwa.com/clothes/men/homewear/20806-m-5xl/?variation_id=27268</g:link>
  <g:image_link>https://elshawwa.com/images/detailed/21/20806.jpg</g:image_link>
  <g:availability>in stock</g:availability>
  <g:inventory>1</g:inventory>
  <g:price>1,252.00 EGP</g:price>
  <g:product_type><![CDATA[الملابس > رجالي > ملابس بيتي رجالي]]></g:product_type>
  <g:brand><![CDATA[مجموعة الشوا التجارية]]></g:brand>
  <g:size><![CDATA[M]]></g:size>
  <g:gender><![CDATA[male]]></g:gender>
</item>
<item>
  <g:id>27263</g:id>
  <g:item_group_id><![CDATA[G_4700]]></g:item_group_id>
  <g:mpn><![CDATA[8425903]]></g:mpn>
  <g:title><![CDATA[ترينج رجالى نص كم قطن ليكرا مقاس M-5XL (موديل 20806)]]></g:title>
  <g:link>https://elshawwa.com/clothes/men/homewear/20806-m-5xl/</g:link>
  <g:availability>in stock</g:availability>
  <g:inventory>2</g:inventory>
  <g:price>1,206.00 EGP</g:price>
  <g:product_type><![CDATA[الملابس > رجالي > ملابس بيتي رجالي]]></g:product_type>
  <g:brand><![CDATA[مجموعة الشوا التجارية]]></g:brand>
  <g:size><![CDATA[M]]></g:size>
  <g:gender><![CDATA[male]]></g:gender>
</item>
<item>
  <g:id>23637</g:id>
  <g:item_group_id><![CDATA[G_3806]]></g:item_group_id>
  <g:mpn><![CDATA[1327387_B968]]></g:mpn>
  <g:title><![CDATA[طقم دفاية رجالى شتوي حوض ليكرا مكستر L ميراج]]></g:title>
  <g:link>https://elshawwa.com/clothes/thermal-wear-sets/l-ar/</g:link>
  <g:availability>out of stock</g:availability>
  <g:inventory>0</g:inventory>
  <g:price>360.00 EGP</g:price>
  <g:product_type><![CDATA[الملابس > أطقم الدفايات]]></g:product_type>
  <g:brand><![CDATA[ميراج]]></g:brand>
  <g:size><![CDATA[L]]></g:size>
  <g:gender><![CDATA[male]]></g:gender>
</item>
<item>
  <g:id>24716</g:id>
  <g:item_group_id><![CDATA[G_3812]]></g:item_group_id>
  <g:mpn><![CDATA[1327218_8A30]]></g:mpn>
  <g:title><![CDATA[طقم شتوى حريمى ليكرا S ميراج]]></g:title>
  <g:link>https://elshawwa.com/clothes/thermal-wear-sets/s-ar-8/</g:link>
  <g:availability>in stock</g:availability>
  <g:inventory>2</g:inventory>
  <g:price>336.00 EGP</g:price>
  <g:product_type><![CDATA[الملابس > أطقم الدفايات]]></g:product_type>
  <g:brand><![CDATA[ميراج]]></g:brand>
  <g:size><![CDATA[S]]></g:size>
  <g:gender><![CDATA[female]]></g:gender>
  <g:age_group><![CDATA[adult]]></g:age_group>
</item>
</channel>
</rss>'''.encode('utf-8')

# فيد كبير صناعي (30,000 منتج) لاختبار التعامل مع الملفات الضخمة
_parts = []
for i in range(1, 30001):
    _parts.append(
        f"<item><g:id>{i}</g:id><g:title><![CDATA[منتج تجريبي رقم {i} - ألوان متنوعة]]></g:title>"
        f"<g:link>https://elshawwa.com/p/{i}</g:link><g:availability>in stock</g:availability>"
        f"<g:price>{50 + (i % 500)}.00 EGP</g:price>"
        f"<g:product_type><![CDATA[قسم تجريبي > فرعي {i % 20}]]></g:product_type>"
        f"<g:brand><![CDATA[الشوا]]></g:brand><g:size><![CDATA[{['S','M','L','XL'][i % 4]}]]></g:size></item>"
    )
BIG_FEED = ('<?xml version="1.0" encoding="utf-8"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel>'
            + ''.join(_parts) + '</channel></rss>').encode('utf-8')

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
        elif path == '/feed-xml':
            # صيغة Google Shopping RSS الحقيقية (CDATA + g: وسوم + سعر بنص العملة)
            self._send(CSV_UTF8 and XML_FEED, 'application/rss+xml; charset=utf-8')
        elif path == '/feed-big':
            self._send(BIG_FEED, 'application/rss+xml; charset=utf-8')
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
