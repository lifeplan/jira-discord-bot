import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendJiraNotification, parseJiraIssue, sendJiraCommentToThread } from '../services/discord.js';
import { saveMapping, getMappingByTicketKey } from '../database/mappings.js';
import { extractCommentText } from '../services/jira.js';
import type { JiraWebhookPayload } from '../services/jira.js';

// Discord에서 보낸 코멘트인지 확인 (이중 알림 방지)
const DISCORD_COMMENT_PREFIX = '[Discord -';

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Jira Webhook 수신
  fastify.post(
    '/webhook/jira',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.body as JiraWebhookPayload;

      fastify.log.info({ webhookEvent: payload.webhookEvent }, 'Received Jira webhook');

      // 이슈 생성 이벤트
      if (payload.webhookEvent === 'jira:issue_created') {
        return handleIssueCreated(fastify, payload, reply);
      }

      // 코멘트 생성 이벤트
      if (payload.webhookEvent === 'comment_created') {
        return handleCommentCreated(fastify, payload, reply);
      }

      // 그 외 이벤트는 무시
      fastify.log.info(`Ignoring event: ${payload.webhookEvent}`);
      return { ignored: true, event: payload.webhookEvent };
    }
  );
}

// 이슈 생성 처리
async function handleIssueCreated(
  fastify: FastifyInstance,
  payload: JiraWebhookPayload,
  reply: FastifyReply
) {
  if (!payload.issue) {
    fastify.log.warn('No issue in payload');
    return reply.status(400).send({ error: 'No issue in payload' });
  }

  try {
    // Jira 이슈 정보 파싱
    const ticket = parseJiraIssue(payload.issue);
    fastify.log.info({ ticketKey: ticket.key }, 'Processing ticket');

    // Discord에 알림 전송 + 스레드 생성
    const { messageId, threadId, channelId } = await sendJiraNotification(ticket);
    fastify.log.info({ threadId, ticketKey: ticket.key }, 'Thread created');

    // 매핑 저장
    saveMapping(threadId, ticket.key, messageId, channelId);
    fastify.log.info({ threadId, ticketKey: ticket.key }, 'Mapping saved');

    return {
      success: true,
      ticketKey: ticket.key,
      threadId,
      messageId,
    };
  } catch (error) {
    fastify.log.error(error, 'Failed to process issue created');
    return reply.status(500).send({
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// 코멘트 생성 처리
async function handleCommentCreated(
  fastify: FastifyInstance,
  payload: JiraWebhookPayload,
  reply: FastifyReply
) {
  if (!payload.issue || !payload.comment) {
    fastify.log.warn('No issue or comment in payload');
    return reply.status(400).send({ error: 'No issue or comment in payload' });
  }

  const ticketKey = payload.issue.key;
  const commentText = extractCommentText(payload.comment);
  const authorName = payload.comment.author?.displayName ?? 'Unknown';

  // Discord에서 보낸 코멘트면 무시 (이중 알림 방지)
  if (commentText.startsWith(DISCORD_COMMENT_PREFIX)) {
    fastify.log.info({ ticketKey }, 'Ignoring Discord-originated comment');
    return { ignored: true, reason: 'discord-originated' };
  }

  // 매핑된 스레드 찾기
  const mapping = getMappingByTicketKey(ticketKey);
  if (!mapping) {
    fastify.log.info({ ticketKey }, 'No mapping found for ticket');
    return { ignored: true, reason: 'no-mapping' };
  }

  try {
    // Discord 스레드에 메시지 전송
    await sendJiraCommentToThread(mapping.thread_id, authorName, commentText);
    fastify.log.info({ ticketKey, threadId: mapping.thread_id }, 'Comment sent to Discord');

    return {
      success: true,
      ticketKey,
      threadId: mapping.thread_id,
    };
  } catch (error) {
    fastify.log.error(error, 'Failed to send comment to Discord');
    return reply.status(500).send({
      error: 'Failed to send comment to Discord',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
