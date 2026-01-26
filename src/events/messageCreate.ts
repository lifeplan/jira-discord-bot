import { Message } from 'discord.js';
import { getTicketKeyByThreadId, saveCommentMapping, convertDiscordMentionsToJira } from '../database/mappings.js';
import { addComment } from '../services/jira.js';

export async function handleMessageCreate(message: Message): Promise<void> {
  // 봇 메시지 무시
  if (message.author.bot) return;

  // 스레드가 아니면 무시
  if (!message.channel.isThread()) return;

  const threadId = message.channel.id;
  const ticketKey = await getTicketKeyByThreadId(threadId);

  // 매핑된 티켓이 없으면 무시 (우리가 만든 스레드가 아님)
  if (!ticketKey) return;

  try {
    // 유저 정보 저장
    const authorName = message.member?.displayName ?? message.author.displayName ?? message.author.username;
    const originalContent = message.content;

    // 1. 유저 메시지 삭제
    await message.delete();

    // 2. 봇이 대신 메시지 전송 (Discord에 표시될 형식)
    const botMessage = await message.channel.send(`**${authorName}:** ${originalContent}`);

    // 3. Discord 멘션을 Jira 멘션으로 변환
    const convertedContent = await convertDiscordMentionsToJira(originalContent);

    // 4. Jira에 코멘트 추가
    const jiraCommentId = await addComment(ticketKey, convertedContent, authorName);

    // 5. 코멘트 매핑 저장 (봇 메시지 ID로 저장 - 수정 가능하도록)
    await saveCommentMapping(botMessage.id, jiraCommentId, threadId, ticketKey, 'discord');

    console.log(`[Discord → Jira] Comment added to ${ticketKey} by ${authorName}`);
  } catch (error) {
    console.error(`Failed to add comment to ${ticketKey}:`, error);

    // 실패 시 알림 메시지 전송
    try {
      await message.channel.send(`❌ 메시지 동기화 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } catch {
      // 알림 전송도 실패하면 무시
    }
  }
}
