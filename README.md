
# **상세 설정 가이드**
 [Notion 문서](https://living-pyrite-devops.notion.site/2f2edcaaa6bb801e80cec0e267f033ad)에서 Discord 봇 생성, Jira API 토큰 발급, Webhook 설정 등 자세한 방법을 확인할 수 있습니다.

# Jira-Discord Bot

Jira 티켓과 Discord 스레드를 양방향으로 연동하는 봇


## 주요 기능

- Jira 티켓 생성 시 Discord 채널에 알림 + 스레드 자동 생성
- Discord 스레드 댓글 → Jira 티켓 코멘트로 동기화
- Jira 코멘트 → Discord 스레드로 동기화

## 설치

```bash
pnpm install
```

## 환경변수

`.env.example`을 `.env`로 복사 후 설정:

```env
# Discord
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CHANNEL_ID=your_channel_id

# Jira
JIRA_HOST=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your_api_token
JIRA_PROJECT_KEY=LP

# Server
NODE_ENV=development
```

## 실행

```bash
# 개발
pnpm dev

# 빌드 & 실행
pnpm build && pnpm start

# Docker
docker compose up -d
```
