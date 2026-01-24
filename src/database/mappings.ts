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
