FROM python:3.11-alpine

WORKDIR /app

RUN apk add --no-cache curl openssl ca-certificates

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py index.html .

EXPOSE 3000

CMD ["python", "app.py"]
