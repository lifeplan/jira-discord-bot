#!/bin/bash
# 최신 코드 pull + 컨테이너 재빌드
set -e
cd "$(dirname "$0")"

echo "=== 최신 코드 pull ==="
git pull origin main

echo ""
echo "=== 컨테이너 재빌드 및 재시작 ==="
docker compose up -d --build

echo ""
echo "=== 이전 이미지 정리 ==="
docker image prune -f

echo ""
echo "=== 상태 확인 ==="
docker compose ps

echo ""
echo "로그 확인: docker compose logs -f"
