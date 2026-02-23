#!/bin/bash
# GCP e2-micro 초기 설정 스크립트
# Docker, Docker Compose, Git 설치 (Debian/Ubuntu)
set -e

echo "=== 시스템 업데이트 ==="
sudo apt-get update && sudo apt-get upgrade -y

echo "=== Git 설치 ==="
sudo apt-get install -y git

echo "=== Docker 설치 ==="
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 docker 실행 가능)
sudo usermod -aG docker "$USER"

echo ""
echo "=== 설치 완료 ==="
docker --version
docker compose version
git --version
echo ""
echo "※ docker 그룹 적용을 위해 재로그인 필요: exit 후 다시 SSH 접속"
echo ""
echo "=== 다음 단계 ==="
echo "1. git clone <repo-url> && cd jira-discord-bot"
echo "2. cp .env.example .env && vi .env"
echo "3. ./start.sh"
