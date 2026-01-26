import { supabase } from './index.js';

// ============ 스레드-티켓 매핑 ============

export interface ThreadTicketMapping {
  id: number;
  thread_id: string;
  ticket_key: string;
  message_id: string;
  channel_id: string;
  created_at: string;
}

// 매핑 저장
export async function saveMapping(
  threadId: string,
  ticketKey: string,
  messageId: string,
  channelId: string
): Promise<void> {
  const { error } = await supabase
    .from('thread_ticket_mappings')
    .insert({
      thread_id: threadId,
      ticket_key: ticketKey,
      message_id: messageId,
      channel_id: channelId,
    });

  if (error) throw error;
}

// 스레드 ID로 티켓 키 조회
export async function getTicketKeyByThreadId(threadId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('thread_ticket_mappings')
    .select('ticket_key')
    .eq('thread_id', threadId)
    .single();

  if (error || !data) return null;
  return data.ticket_key;
}

// 티켓 키로 매핑 조회
export async function getMappingByTicketKey(ticketKey: string): Promise<ThreadTicketMapping | null> {
  const { data, error } = await supabase
    .from('thread_ticket_mappings')
    .select('*')
    .eq('ticket_key', ticketKey)
    .single();

  if (error || !data) return null;
  return data as ThreadTicketMapping;
}

// 스레드 ID로 매핑 조회
export async function getMappingByThreadId(threadId: string): Promise<ThreadTicketMapping | null> {
  const { data, error } = await supabase
    .from('thread_ticket_mappings')
    .select('*')
    .eq('thread_id', threadId)
    .single();

  if (error || !data) return null;
  return data as ThreadTicketMapping;
}

// 매핑 삭제 (스레드 삭제 시)
export async function deleteMappingByThreadId(threadId: string): Promise<void> {
  const { error } = await supabase
    .from('thread_ticket_mappings')
    .delete()
    .eq('thread_id', threadId);

  if (error) throw error;
}

// 티켓 키로 매핑 삭제
export async function deleteMappingByTicketKey(ticketKey: string): Promise<void> {
  const { error } = await supabase
    .from('thread_ticket_mappings')
    .delete()
    .eq('ticket_key', ticketKey);

  if (error) throw error;
}

// 모든 매핑 조회 (디버깅용)
export async function getAllMappings(): Promise<ThreadTicketMapping[]> {
  const { data, error } = await supabase
    .from('thread_ticket_mappings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ThreadTicketMapping[];
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
export async function saveUserMapping(
  jiraAccountId: string,
  jiraDisplayName: string,
  discordUserId: string
): Promise<void> {
  const { error } = await supabase
    .from('user_mappings')
    .upsert(
      {
        jira_account_id: jiraAccountId,
        jira_display_name: jiraDisplayName,
        discord_user_id: discordUserId,
      },
      { onConflict: 'jira_account_id' }
    );

  if (error) throw error;
}

// Jira 계정 ID로 Discord 사용자 ID 조회
export async function getDiscordUserByJiraAccount(jiraAccountId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_mappings')
    .select('discord_user_id')
    .eq('jira_account_id', jiraAccountId)
    .single();

  if (error || !data) return null;
  return data.discord_user_id;
}

// Discord 사용자 ID로 Jira 계정 ID 조회 (Discord → Jira 멘션 변환용)
export async function getJiraAccountByDiscordUser(discordUserId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_mappings')
    .select('jira_account_id')
    .eq('discord_user_id', discordUserId)
    .single();

  if (error || !data) return null;
  return data.jira_account_id;
}

// Jira 계정 ID로 표시 이름 조회 (Jira ADF 멘션 노드용)
export async function getJiraDisplayNameByAccount(jiraAccountId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_mappings')
    .select('jira_display_name')
    .eq('jira_account_id', jiraAccountId)
    .single();

  if (error || !data) return null;
  return data.jira_display_name;
}

// Discord 멘션을 Jira 멘션으로 변환
export async function convertDiscordMentionsToJira(content: string): Promise<string> {
  // Discord 멘션 패턴: <@123456789> 또는 <@!123456789>
  const mentionRegex = /<@!?(\d+)>/g;
  const matches = [...content.matchAll(mentionRegex)];

  let result = content;
  for (const match of matches) {
    const discordUserId = match[1];
    const jiraAccountId = await getJiraAccountByDiscordUser(discordUserId);

    if (jiraAccountId) {
      // Jira 멘션 형식으로 변환
      result = result.replace(match[0], `[~accountid:${jiraAccountId}]`);
    }
  }

  return result;
}

// Jira 표시 이름으로 Discord 사용자 ID 조회 (멘션 변환용)
export async function getDiscordUserByJiraDisplayName(displayName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_mappings')
    .select('discord_user_id')
    .eq('jira_display_name', displayName)
    .single();

  if (error || !data) return null;
  return data.discord_user_id;
}

// 사용자 매핑 삭제
export async function deleteUserMapping(jiraAccountId: string): Promise<void> {
  const { error } = await supabase
    .from('user_mappings')
    .delete()
    .eq('jira_account_id', jiraAccountId);

  if (error) throw error;
}

// 모든 사용자 매핑 조회
export async function getAllUserMappings(): Promise<UserMapping[]> {
  const { data, error } = await supabase
    .from('user_mappings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as UserMapping[];
}

// ============ 코멘트-메시지 매핑 (수정/삭제 동기화용) ============

export interface CommentMessageMapping {
  id: number;
  discord_message_id: string;
  jira_comment_id: string | null;
  thread_id: string;
  ticket_key: string;
  source: 'discord' | 'jira';
  created_at: string;
}

// 코멘트-메시지 매핑 저장
export async function saveCommentMapping(
  discordMessageId: string,
  jiraCommentId: string | null,
  threadId: string,
  ticketKey: string,
  source: 'discord' | 'jira'
): Promise<void> {
  const { error } = await supabase
    .from('comment_message_mappings')
    .insert({
      discord_message_id: discordMessageId,
      jira_comment_id: jiraCommentId,
      thread_id: threadId,
      ticket_key: ticketKey,
      source,
    });

  if (error) throw error;
}

// Jira 코멘트 ID 업데이트 (Discord에서 먼저 생성된 경우)
export async function updateJiraCommentId(discordMessageId: string, jiraCommentId: string): Promise<void> {
  const { error } = await supabase
    .from('comment_message_mappings')
    .update({ jira_comment_id: jiraCommentId })
    .eq('discord_message_id', discordMessageId);

  if (error) throw error;
}

// Discord 메시지 ID로 매핑 조회
export async function getCommentMappingByDiscordMessage(discordMessageId: string): Promise<CommentMessageMapping | null> {
  const { data, error } = await supabase
    .from('comment_message_mappings')
    .select('*')
    .eq('discord_message_id', discordMessageId)
    .single();

  if (error || !data) return null;
  return data as CommentMessageMapping;
}

// Jira 코멘트 ID로 매핑 조회
export async function getCommentMappingByJiraComment(jiraCommentId: string): Promise<CommentMessageMapping | null> {
  const { data, error } = await supabase
    .from('comment_message_mappings')
    .select('*')
    .eq('jira_comment_id', jiraCommentId)
    .single();

  if (error || !data) return null;
  return data as CommentMessageMapping;
}

// Discord 메시지 ID로 매핑 삭제
export async function deleteCommentMappingByDiscordMessage(discordMessageId: string): Promise<void> {
  const { error } = await supabase
    .from('comment_message_mappings')
    .delete()
    .eq('discord_message_id', discordMessageId);

  if (error) throw error;
}

// Jira 코멘트 ID로 매핑 삭제
export async function deleteCommentMappingByJiraComment(jiraCommentId: string): Promise<void> {
  const { error } = await supabase
    .from('comment_message_mappings')
    .delete()
    .eq('jira_comment_id', jiraCommentId);

  if (error) throw error;
}

// 티켓 키로 모든 코멘트 매핑 삭제 (티켓 삭제 시)
export async function deleteCommentMappingsByTicketKey(ticketKey: string): Promise<void> {
  const { error } = await supabase
    .from('comment_message_mappings')
    .delete()
    .eq('ticket_key', ticketKey);

  if (error) throw error;
}

// 티켓 키로 모든 코멘트 매핑 조회
export async function getCommentMappingsByTicketKey(ticketKey: string): Promise<CommentMessageMapping[]> {
  const { data, error } = await supabase
    .from('comment_message_mappings')
    .select('*')
    .eq('ticket_key', ticketKey);

  if (error) throw error;
  return (data ?? []) as CommentMessageMapping[];
}
