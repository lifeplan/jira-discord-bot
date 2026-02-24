#!/bin/bash
# Nginx 설정 + Let's Encrypt SSL 인증서 발급
set -e
cd "$(dirname "$0")"

DOMAIN="sdpg.shop"

echo "=== Nginx 설정 복사 (HTTP only) ==="
sudo mkdir -p /var/www/certbot
sudo cp nginx/bot-http.conf /etc/nginx/sites-available/bot
sudo ln -sf /etc/nginx/sites-available/bot /etc/nginx/sites-enabled/bot
sudo rm -f /etc/nginx/sites-enabled/default

echo "=== Nginx 시작 (HTTP) ==="
sudo nginx -t && sudo systemctl restart nginx

echo "=== SSL 인증서 발급 ==="
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email

echo "=== Nginx 재시작 (HTTPS) ==="
sudo nginx -t && sudo systemctl restart nginx

# certbot 자동 갱신 확인
echo "=== Certbot 자동 갱신 타이머 확인 ==="
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

echo ""
echo "=== SSL 설정 완료 ==="
echo "https://${DOMAIN} 으로 접속 가능"
echo "인증서 자동 갱신: certbot.timer (12시간마다 체크)"
