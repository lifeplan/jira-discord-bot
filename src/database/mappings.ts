import { db } from './index.js';

export interface ThreadTicketMapping {
  id: number;
  thread_id: string;
  ticket_key: string;
  message_id: string;
  channel_id: string;
  created_at: string;
}

// 매핑 저장
export function saveMapping(
  threadId: string,
  ticketKey: string,
  messageId: string,
  channelId: string
): void {
  const stmt = db.prepare(`
    INSERT INTO thread_ticket_mappings (thread_id, ticket_key, message_id, channel_id)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(threadId, ticketKey, messageId, channelId);
}

// 스레드 ID로 티켓 키 조회
export function getTicketKeyByThreadId(threadId: string): string | null {
  const stmt = db.prepare(`
    SELECT ticket_key FROM thread_ticket_mappings WHERE thread_id = ?
  `);
  const row = stmt.get(threadId) as { ticket_key: string } | undefined;
  return row?.ticket_key ?? null;
}

// 티켓 키로 매핑 조회
export function getMappingByTicketKey(ticketKey: string): ThreadTicketMapping | null {
  const stmt = db.prepare(`
    SELECT * FROM thread_ticket_mappings WHERE ticket_key = ?
  `);
  return (stmt.get(ticketKey) as ThreadTicketMapping) ?? null;
}

// 스레드 ID로 매핑 조회
export function getMappingByThreadId(threadId: string): ThreadTicketMapping | null {
  const stmt = db.prepare(`
    SELECT * FROM thread_ticket_mappings WHERE thread_id = ?
  `);
  return (stmt.get(threadId) as ThreadTicketMapping) ?? null;
}

// 매핑 삭제 (스레드 삭제 시)
export function deleteMappingByThreadId(threadId: string): void {
  const stmt = db.prepare(`
    DELETE FROM thread_ticket_mappings WHERE thread_id = ?
  `);
  stmt.run(threadId);
}

// 모든 매핑 조회 (디버깅용)
export function getAllMappings(): ThreadTicketMapping[] {
  const stmt = db.prepare(`SELECT * FROM thread_ticket_mappings ORDER BY created_at DESC`);
  return stmt.all() as ThreadTicketMapping[];
}

// ============ 사용자 매핑 (Jira ↔ Discord) ============

export interface UserMapping {
  id: number;
  jira_account_id: string;
  jira_display_name: string;
  discord_user_id: string;
  created_at: string;
}

// 사용자 매핑 저장/업데이트
export function saveUserMapping(
  jiraAccountId: string,
  jiraDisplayName: string,
  discordUserId: string
): void {
  const stmt = db.prepare(`
    INSERT INTO user_mappings (jira_account_id, jira_display_name, discord_user_id)
    VALUES (?, ?, ?)
    ON CONFLICT(jira_account_id) DO UPDATE SET
      jira_display_name = excluded.jira_display_name,
      discord_user_id = excluded.discord_user_id
  `);
  stmt.run(jiraAccountId, jiraDisplayName, discordUserId);
}

// Jira 계정 ID로 Discord 사용자 ID 조회
export function getDiscordUserByJiraAccount(jiraAccountId: string): string | null {
  const stmt = db.prepare(`
    SELECT discord_user_id FROM user_mappings WHERE jira_account_id = ?
  `);
  const row = stmt.get(jiraAccountId) as { discord_user_id: string } | undefined;
  return row?.discord_user_id ?? null;
}

// Jira 표시 이름으로 Discord 사용자 ID 조회 (멘션 변환용)
export function getDiscordUserByJiraDisplayName(displayName: string): string | null {
  const stmt = db.prepare(`
    SELECT discord_user_id FROM user_mappings WHERE jira_display_name = ?
  `);
  const row = stmt.get(displayName) as { discord_user_id: string } | undefined;
  return row?.discord_user_id ?? null;
}

// 사용자 매핑 삭제
export function deleteUserMapping(jiraAccountId: string): void {
  const stmt = db.prepare(`
    DELETE FROM user_mappings WHERE jira_account_id = ?
  `);
  stmt.run(jiraAccountId);
}

// 모든 사용자 매핑 조회
export function getAllUserMappings(): UserMapping[] {
  const stmt = db.prepare(`SELECT * FROM user_mappings ORDER BY created_at DESC`);
  return stmt.all() as UserMapping[];
}

// ============ 코멘트-메시지 매핑 (수정/삭제 동기화용) ============

export interface CommentMessageMapping {
  id: number;
  discord_message_id: string;
  jira_comment_id: string | null;
  thread_id: string;
  ticket_key: string;
  source: 'discord' | 'jira'; // 원본 출처
  created_at: string;
}

// 코멘트-메시지 매핑 저장
export function saveCommentMapping(
  discordMessageId: string,
  jiraCommentId: string | null,
  threadId: string,
  ticketKey: string,
  source: 'discord' | 'jira'
): void {
  const stmt = db.prepare(`
    INSERT INTO comment_message_mappings (discord_message_id, jira_comment_id, thread_id, ticket_key, source)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(discordMessageId, jiraCommentId, threadId, ticketKey, source);
}

// Jira 코멘트 ID 업데이트 (Discord에서 먼저 생성된 경우)
export function updateJiraCommentId(discordMessageId: string, jiraCommentId: string): void {
  const stmt = db.prepare(`
    UPDATE comment_message_mappings SET jira_comment_id = ? WHERE discord_message_id = ?
  `);
  stmt.run(jiraCommentId, discordMessageId);
}

// Discord 메시지 ID로 매핑 조회
export function getCommentMappingByDiscordMessage(discordMessageId: string): CommentMessageMapping | null {
  const stmt = db.prepare(`
    SELECT * FROM comment_message_mappings WHERE discord_message_id = ?
  `);
  return (stmt.get(discordMessageId) as CommentMessageMapping) ?? null;
}

// Jira 코멘트 ID로 매핑 조회
export function getCommentMappingByJiraComment(jiraCommentId: string): CommentMessageMapping | null {
  const stmt = db.prepare(`
    SELECT * FROM comment_message_mappings WHERE jira_comment_id = ?
  `);
  return (stmt.get(jiraCommentId) as CommentMessageMapping) ?? null;
}

// Discord 메시지 ID로 매핑 삭제
export function deleteCommentMappingByDiscordMessage(discordMessageId: string): void {
  const stmt = db.prepare(`
    DELETE FROM comment_message_mappings WHERE discord_message_id = ?
  `);
  stmt.run(discordMessageId);
}

// Jira 코멘트 ID로 매핑 삭제
export function deleteCommentMappingByJiraComment(jiraCommentId: string): void {
  const stmt = db.prepare(`
    DELETE FROM comment_message_mappings WHERE jira_comment_id = ?
  `);
  stmt.run(jiraCommentId);
}

// 티켓 키로 모든 코멘트 매핑 삭제 (티켓 삭제 시)
export function deleteCommentMappingsByTicketKey(ticketKey: string): void {
  const stmt = db.prepare(`
    DELETE FROM comment_message_mappings WHERE ticket_key = ?
  `);
  stmt.run(ticketKey);
}

// 티켓 키로 모든 코멘트 매핑 조회
export function getCommentMappingsByTicketKey(ticketKey: string): CommentMessageMapping[] {
  const stmt = db.prepare(`
    SELECT * FROM comment_message_mappings WHERE ticket_key = ?
  `);
  return stmt.all(ticketKey) as CommentMessageMapping[];
}
