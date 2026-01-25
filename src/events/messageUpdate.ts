import { Message, PartialMessage } from 'discord.js';
import { getCommentMappingByDiscordMessage } from '../database/mappings.js';
import { updateComment } from '../services/jira.js';

export async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): Promise<void> {
  // 스레드가 아니면 무시
  if (!newMessage.channel.isThread()) return;

  // PartialMessage인 경우 전체 메시지 fetch
  let message = newMessage;
  if (newMessage.partial) {
    try {
      message = await newMessage.fetch();
    } catch {
      return; // fetch 실패하면 무시
    }
  }

  // 봇 메시지 무시
  if (message.author?.bot) return;

  // 콘텐츠가 실제로 변경됐는지 확인 (embed 변경 등 무시)
  const oldContent = oldMessage.partial ? null : oldMessage.content;
  if (oldContent !== null && oldContent === message.content) return;

  // 매핑된 코멘트 찾기
  const mapping = getCommentMappingByDiscordMessage(message.id);
  if (!mapping || !mapping.jira_comment_id) {
    return; // 매핑 없거나 Jira 코멘트 ID 없으면 무시
  }

  // Discord에서 생성된 메시지만 수정 동기화
  if (mapping.source !== 'discord') return;

  try {
    const authorName = message.author?.displayName ?? message.author?.username ?? 'Unknown';
    const content = message.content ?? '';

    await updateComment(
      mapping.ticket_key,
      mapping.jira_comment_id,
      content,
      authorName
    );

    console.log(`Jira comment updated: ${mapping.jira_comment_id}`);
  } catch (error) {
    console.error('Failed to update Jira comment:', error);
  }
}
