
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

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxx...

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

## Supabase 설정

Supabase SQL Editor에서 아래 SQL 실행:

```sql
-- 테이블 생성
CREATE TABLE thread_ticket_mappings (
  id SERIAL PRIMARY KEY,
  thread_id TEXT UNIQUE NOT NULL,
  ticket_key TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_mappings (
  id SERIAL PRIMARY KEY,
  jira_account_id TEXT UNIQUE NOT NULL,
  jira_display_name TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comment_message_mappings (
  id SERIAL PRIMARY KEY,
  discord_message_id TEXT UNIQUE NOT NULL,
  jira_comment_id TEXT UNIQUE,
  thread_id TEXT NOT NULL,
  ticket_key TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_ticket_key ON thread_ticket_mappings(ticket_key);
CREATE INDEX idx_jira_comment_id ON comment_message_mappings(jira_comment_id);

-- RLS 비활성화
ALTER TABLE thread_ticket_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE comment_message_mappings DISABLE ROW LEVEL SECURITY;

-- 권한 부여
GRANT ALL ON thread_ticket_mappings TO anon, authenticated;
GRANT ALL ON user_mappings TO anon, authenticated;
GRANT ALL ON comment_message_mappings TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
```
