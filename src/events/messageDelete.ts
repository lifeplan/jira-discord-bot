import { Message, PartialMessage } from 'discord.js';
import {
  getCommentMappingByDiscordMessage,
  deleteCommentMappingByDiscordMessage,
} from '../database/mappings.js';
import { deleteComment } from '../services/jira.js';

export async function handleMessageDelete(
  message: Message | PartialMessage
): Promise<void> {
  // 스레드가 아니면 무시 (partial이어도 channel은 있음)
  if (!message.channel.isThread()) return;

  // 삭제된 메시지는 fetch 불가 - message.id만 사용
  const messageId = message.id;

  // 매핑된 코멘트 찾기
  const mapping = await getCommentMappingByDiscordMessage(messageId);
  if (!mapping || !mapping.jira_comment_id) {
    return; // 매핑 없거나 Jira 코멘트 ID 없으면 무시
  }

  // Discord에서 생성된 메시지만 삭제 동기화
  if (mapping.source !== 'discord') {
    // Jira에서 생성된 메시지면 매핑만 삭제
    await deleteCommentMappingByDiscordMessage(messageId);
    return;
  }

  try {
    await deleteComment(mapping.ticket_key, mapping.jira_comment_id);
    await deleteCommentMappingByDiscordMessage(messageId);

    console.log(`Jira comment deleted: ${mapping.jira_comment_id}`);
  } catch (error) {
    console.error('Failed to delete Jira comment:', error);
    // 실패해도 매핑은 삭제
    await deleteCommentMappingByDiscordMessage(messageId);
  }
}
