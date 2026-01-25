import { Message } from 'discord.js';
import { getTicketKeyByThreadId, saveCommentMapping } from '../database/mappings.js';
import { addComment } from '../services/jira.js';

export async function handleMessageCreate(message: Message): Promise<void> {
  // 봇 메시지 무시
  if (message.author.bot) return;

  // 스레드가 아니면 무시
  if (!message.channel.isThread()) return;

  const threadId = message.channel.id;
  const ticketKey = getTicketKeyByThreadId(threadId);

  // 매핑된 티켓이 없으면 무시 (우리가 만든 스레드가 아님)
  if (!ticketKey) return;

  try {
    // Jira에 코멘트 추가
    const authorName = message.member?.displayName ?? message.author.displayName ?? message.author.username;
    const jiraCommentId = await addComment(ticketKey, message.content, authorName);

    // 코멘트 매핑 저장 (수정/삭제 동기화용)
    saveCommentMapping(message.id, jiraCommentId, threadId, ticketKey, 'discord');

    // 성공 리액션
    await message.react('✅');

    console.log(`[Discord → Jira] Comment added to ${ticketKey} by ${authorName}`);
  } catch (error) {
    console.error(`Failed to add comment to ${ticketKey}:`, error);

    // 실패 리액션
    await message.react('❌');
  }
}
