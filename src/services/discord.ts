import {
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
  ThreadChannel,
  EmbedBuilder,
  ColorResolvable,
} from 'discord.js';
import { config } from '../config.js';
import type { JiraIssue } from './jira.js';
import { extractDescriptionMarkdown } from './jira.js';

// Discord 클라이언트 초기화
export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  // messageUpdate/messageDelete 이벤트에서 캐시되지 않은 메시지 정보를 받기 위해 필요
  partials: [Partials.Message, Partials.Channel],
});

// 우선순위별 색상
const PRIORITY_COLORS: Record<string, ColorResolvable> = {
  Highest: 0xff0000,  // 빨강
  High: 0xff6b6b,     // 연한 빨강
  Medium: 0xffa500,   // 주황
  Low: 0x4dabf7,      // 파랑
  Lowest: 0x69db7c,   // 초록
};

// 이슈 타입별 이모지
const ISSUE_TYPE_EMOJI: Record<string, string> = {
  Bug: '🐛',
  Task: '📋',
  Story: '📖',
  Epic: '🎯',
  'Sub-task': '📎',
};

export interface TicketInfo {
  key: string;
  summary: string;
  type: string;
  assignee: string | null;
  priority: string;
  description: string;
  url: string;
  status: string;
}

// JiraIssue를 TicketInfo로 변환
export async function parseJiraIssue(issue: JiraIssue): Promise<TicketInfo> {
  // 마크다운 형식의 설명
  const description = await extractDescriptionMarkdown(issue.fields.description);

  return {
    key: issue.key,
    summary: issue.fields.summary,
    type: issue.fields.issuetype?.name ?? 'Task',
    assignee: issue.fields.assignee?.displayName ?? null,
    priority: issue.fields.priority?.name ?? 'Medium',
    description: description.slice(0, 1000), // embed 제한 고려
    url: `${config.jira.host}/browse/${issue.key}`,
    status: issue.fields.status?.name ?? 'To Do',
  };
}

// Discord에 Jira 티켓 알림 전송 + 스레드 생성
export async function sendJiraNotification(ticket: TicketInfo): Promise<{
  messageId: string;
  threadId: string;
  channelId: string;
}> {
  const channel = await discordClient.channels.fetch(config.discord.channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel not found or not a text channel: ${config.discord.channelId}`);
  }

  const embed = createTicketEmbed(ticket);
  const message = await channel.send({ embeds: [embed] });

  // 스레드 생성 (제목 최대 100자)
  const threadName = `[${ticket.key}] ${ticket.summary}`.slice(0, 100);
  const thread = await message.startThread({
    name: threadName,
    autoArchiveDuration: 10080, // 7일 후 자동 아카이브
  });

  return {
    messageId: message.id,
    threadId: thread.id,
    channelId: channel.id,
  };
}

// Discord 스레드에 Jira 코멘트 전송 (메시지 ID 반환)
export async function sendJiraCommentToThread(
  threadId: string,
  authorName: string,
  content: string
): Promise<string> {
  const thread = await discordClient.channels.fetch(threadId);

  if (!thread || !(thread instanceof ThreadChannel)) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  // 아카이브된 스레드면 언아카이브
  if (thread.archived) {
    await thread.setArchived(false);
  }

  const message = await thread.send({
    content: `**[Jira - ${authorName}]**\n${content}`,
  });

  return message.id;
}

// Embed 생성 헬퍼 함수
function createTicketEmbed(ticket: TicketInfo): EmbedBuilder {
  const emoji = ISSUE_TYPE_EMOJI[ticket.type] ?? '🎫';
  const color = PRIORITY_COLORS[ticket.priority] ?? 0x0052cc;

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} [${ticket.key}] ${ticket.summary}`)
    .setURL(ticket.url)
    .setColor(color)
    .addFields(
      { name: '타입', value: ticket.type, inline: true },
      { name: '담당자', value: ticket.assignee ?? '미지정', inline: true },
      { name: '우선순위', value: ticket.priority, inline: true }
    )
    .setFooter({
      text: '💬 이 스레드에 댓글을 달면 Jira 티켓에 코멘트가 추가됩니다.',
    })
    .setTimestamp();

  // 설명이 있으면 추가 (1024자 제한)
  if (ticket.description) {
    embed.addFields({
      name: '설명',
      value: ticket.description.length > 1024
        ? `${ticket.description.slice(0, 1021)}...`
        : ticket.description,
    });
  }

  return embed;
}

// Discord 메시지 수정 (이슈 업데이트 시)
export async function updateJiraNotification(
  channelId: string,
  messageId: string,
  ticket: TicketInfo
): Promise<void> {
  const channel = await discordClient.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel not found or not a text channel: ${channelId}`);
  }

  const message = await channel.messages.fetch(messageId);
  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  const embed = createTicketEmbed(ticket);
  await message.edit({ embeds: [embed] });
}

// Discord 스레드 메시지 수정 (Jira 코멘트 수정 시)
export async function editThreadMessage(
  threadId: string,
  messageId: string,
  authorName: string,
  content: string,
  isDiscordOriginated = false
): Promise<void> {
  const thread = await discordClient.channels.fetch(threadId);

  if (!thread || !(thread instanceof ThreadChannel)) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  const message = await thread.messages.fetch(messageId);
  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  // Discord에서 시작된 메시지는 "**이름:** 내용" 형식
  // Jira에서 시작된 메시지는 "**[Jira - 이름]**\n내용" 형식
  const formattedContent = isDiscordOriginated
    ? `**${authorName}:** ${content}`
    : `**[Jira - ${authorName}]**\n${content}`;

  await message.edit({
    content: formattedContent,
    allowedMentions: { parse: ['users'] }, // 멘션 렌더링 허용
  });
}

// Discord 스레드 메시지 삭제 (Jira 코멘트 삭제 시)
export async function deleteThreadMessage(
  threadId: string,
  messageId: string
): Promise<void> {
  const thread = await discordClient.channels.fetch(threadId);

  if (!thread || !(thread instanceof ThreadChannel)) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  const message = await thread.messages.fetch(messageId);
  if (message) {
    await message.delete();
  }
}

// Discord 메시지 + 스레드 삭제 (Jira 티켓 삭제 시)
export async function deleteJiraNotification(
  channelId: string,
  messageId: string,
  threadId: string
): Promise<void> {
  const channel = await discordClient.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  // 스레드 먼저 삭제
  try {
    const thread = await discordClient.channels.fetch(threadId);
    if (thread && thread instanceof ThreadChannel) {
      await thread.delete();
    }
  } catch {
    // 스레드가 이미 삭제된 경우 무시
  }

  // 메시지 삭제
  try {
    const message = await channel.messages.fetch(messageId);
    if (message) {
      await message.delete();
    }
  } catch {
    // 메시지가 이미 삭제된 경우 무시
  }
}

// Discord 봇 로그인
export async function loginDiscord(): Promise<void> {
  console.log('[Discord] Starting login with token length:', config.discord.token.length);
  console.log('[Discord] Token prefix:', config.discord.token.slice(0, 20) + '...');

  try {
    await discordClient.login(config.discord.token);
    console.log('[Discord] Login completed successfully');
  } catch (error) {
    console.error('[Discord] Login failed:', error);
    throw error;
  }
}

// 회의록 요약 정보
export interface MeetingSummaryInfo {
  title: string;
  date: string;
  summary: string;
  confluenceUrl?: string;
  highlights?: string[];
}

// Discord에 회의록 요약 전송 (#문서-노티 채널)
export async function sendMeetingSummary(
  channelId: string,
  meeting: MeetingSummaryInfo
): Promise<string> {
  const channel = await discordClient.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(`Channel not found or not a text channel: ${channelId}`);
  }

  const embed = new EmbedBuilder()
    .setTitle(`📝 [${meeting.date}] ${meeting.title}`)
    .setColor(0x5865f2) // Discord 브랜드 블루
    .setDescription(meeting.summary)
    .setTimestamp();

  // 주요 포인트가 있으면 추가
  if (meeting.highlights && meeting.highlights.length > 0) {
    embed.addFields({
      name: '주요 논의',
      value: meeting.highlights.map(h => `• ${h}`).join('\n'),
    });
  }

  // Confluence 링크가 있으면 추가
  if (meeting.confluenceUrl) {
    embed.addFields({
      name: '📄 문서 링크',
      value: meeting.confluenceUrl,
    });
  }

  embed.setFooter({
    text: '🤖 AI로 자동 생성된 회의록 요약입니다.',
  });

  const message = await channel.send({ embeds: [embed] });

  return message.id;
}
