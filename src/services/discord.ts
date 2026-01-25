import {
  Client,
  GatewayIntentBits,
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
export function parseJiraIssue(issue: JiraIssue): TicketInfo {
  // 마크다운 형식의 설명
  const description = extractDescriptionMarkdown(issue.fields.description);

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

// Discord 스레드에 Jira 코멘트 전송
export async function sendJiraCommentToThread(
  threadId: string,
  authorName: string,
  content: string
): Promise<void> {
  const thread = await discordClient.channels.fetch(threadId);

  if (!thread || !(thread instanceof ThreadChannel)) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  // 아카이브된 스레드면 언아카이브
  if (thread.archived) {
    await thread.setArchived(false);
  }

  await thread.send({
    content: `**[Jira - ${authorName}]**\n${content}`,
  });
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

// Discord 봇 로그인
export async function loginDiscord(): Promise<void> {
  await discordClient.login(config.discord.token);
}
