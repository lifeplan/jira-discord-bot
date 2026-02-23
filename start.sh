#!/bin/bash
# 컨테이너 빌드 및 시작
set -e
cd "$(dirname "$0")"

echo "=== 컨테이너 시작 ==="
docker compose up -d --build

echo ""
echo "=== 상태 확인 ==="
docker compose ps

echo ""
echo "로그 확인: docker compose logs -f"
