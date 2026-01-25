import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

// data 디렉토리 생성
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'mappings.db');
export const db: DatabaseType = new Database(dbPath);

// WAL 모드 활성화 (성능 향상)
db.pragma('journal_mode = WAL');

// 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS thread_ticket_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT UNIQUE NOT NULL,
    ticket_key TEXT NOT NULL,
    message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 사용자 매핑 테이블 (Jira ↔ Discord 멘션용)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jira_account_id TEXT UNIQUE NOT NULL,
    jira_display_name TEXT NOT NULL,
    discord_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 코멘트-메시지 매핑 테이블 (수정/삭제 동기화용)
db.exec(`
  CREATE TABLE IF NOT EXISTS comment_message_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_message_id TEXT UNIQUE NOT NULL,
    jira_comment_id TEXT UNIQUE,
    thread_id TEXT NOT NULL,
    ticket_key TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 인덱스 생성
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_thread_id ON thread_ticket_mappings(thread_id);
  CREATE INDEX IF NOT EXISTS idx_ticket_key ON thread_ticket_mappings(ticket_key);
  CREATE INDEX IF NOT EXISTS idx_jira_account_id ON user_mappings(jira_account_id);
  CREATE INDEX IF NOT EXISTS idx_discord_message_id ON comment_message_mappings(discord_message_id);
  CREATE INDEX IF NOT EXISTS idx_jira_comment_id ON comment_message_mappings(jira_comment_id);
`);

console.log(`Database initialized at ${dbPath}`);
