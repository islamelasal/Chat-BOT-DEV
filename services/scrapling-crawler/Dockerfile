# زاحف Scrapling — خدمة جانبية لتجاوز الحماية (Cloudflare) عند تدريب البوتات
FROM python:3.12-slim

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && scrapling install || echo "⚠️ تعذر تثبيت المتصفحات — سيعمل وضع HTTPX فقط"

COPY main.py .

EXPOSE 4100
CMD ["python", "main.py", "4100"]
