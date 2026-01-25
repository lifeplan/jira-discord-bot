import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  sendJiraNotification,
  parseJiraIssue,
  sendJiraCommentToThread,
  updateJiraNotification,
  editThreadMessage,
  deleteThreadMessage,
  deleteJiraNotification,
} from '../services/discord.js';
import {
  saveMapping,
  getMappingByTicketKey,
  deleteMappingByThreadId,
  saveCommentMapping,
  getCommentMappingByJiraComment,
  deleteCommentMappingByJiraComment,
  deleteCommentMappingsByTicketKey,
} from '../database/mappings.js';
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

      // 이슈 업데이트 이벤트
      if (payload.webhookEvent === 'jira:issue_updated') {
        return handleIssueUpdated(fastify, payload, reply);
      }

      // 코멘트 생성 이벤트
      if (payload.webhookEvent === 'comment_created') {
        return handleCommentCreated(fastify, payload, reply);
      }

      // 코멘트 수정 이벤트
      if (payload.webhookEvent === 'comment_updated') {
        return handleCommentUpdated(fastify, payload, reply);
      }

      // 코멘트 삭제 이벤트
      if (payload.webhookEvent === 'comment_deleted') {
        return handleCommentDeleted(fastify, payload, reply);
      }

      // 이슈 삭제 이벤트
      if (payload.webhookEvent === 'jira:issue_deleted') {
        return handleIssueDeleted(fastify, payload, reply);
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

// 이슈 업데이트 처리
async function handleIssueUpdated(
  fastify: FastifyInstance,
  payload: JiraWebhookPayload,
  reply: FastifyReply
) {
  if (!payload.issue) {
    fastify.log.warn('No issue in payload');
    return reply.status(400).send({ error: 'No issue in payload' });
  }

  const ticketKey = payload.issue.key;

  // 매핑된 메시지 찾기
  const mapping = getMappingByTicketKey(ticketKey);
  if (!mapping) {
    fastify.log.info({ ticketKey }, 'No mapping found for ticket (issue updated)');
    return { ignored: true, reason: 'no-mapping' };
  }

  try {
    // Jira 이슈 정보 파싱
    const ticket = parseJiraIssue(payload.issue);
    fastify.log.info({ ticketKey: ticket.key }, 'Updating Discord message');

    // Discord 메시지 수정
    await updateJiraNotification(mapping.channel_id, mapping.message_id, ticket);
    fastify.log.info({ ticketKey, messageId: mapping.message_id }, 'Discord message updated');

    return {
      success: true,
      ticketKey,
      messageId: mapping.message_id,
      action: 'updated',
    };
  } catch (error) {
    fastify.log.error(error, 'Failed to update Discord message');
    return reply.status(500).send({
      error: 'Failed to update Discord message',
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
    const discordMessageId = await sendJiraCommentToThread(mapping.thread_id, authorName, commentText);
    fastify.log.info({ ticketKey, threadId: mapping.thread_id }, 'Comment sent to Discord');

    // 코멘트 매핑 저장 (수정/삭제 동기화용)
    const jiraCommentId = payload.comment.id;
    saveCommentMapping(discordMessageId, jiraCommentId, mapping.thread_id, ticketKey, 'jira');

    return {
      success: true,
      ticketKey,
      threadId: mapping.thread_id,
      discordMessageId,
    };
  } catch (error) {
    fastify.log.error(error, 'Failed to send comment to Discord');
    return reply.status(500).send({
      error: 'Failed to send comment to Discord',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// 코멘트 수정 처리
async function handleCommentUpdated(
  fastify: FastifyInstance,
  payload: JiraWebhookPayload,
  reply: FastifyReply
) {
  if (!payload.issue || !payload.comment) {
    fastify.log.warn('No issue or comment in payload');
    return reply.status(400).send({ error: 'No issue or comment in payload' });
  }

  const ticketKey = payload.issue.key;
  const jiraCommentId = payload.comment.id;
  const commentText = extractCommentText(payload.comment);
  const authorName = payload.comment.author?.displayName ?? 'Unknown';

  // Discord에서 보낸 코멘트면 무시
  if (commentText.startsWith(DISCORD_COMMENT_PREFIX)) {
    fastify.log.info({ ticketKey }, 'Ignoring Discord-originated comment update');
    return { ignored: true, reason: 'discord-originated' };
  }

  // 매핑된 Discord 메시지 찾기
  const commentMapping = getCommentMappingByJiraComment(jiraCommentId);
  if (!commentMapping) {
    fastify.log.info({ ticketKey, jiraCommentId }, 'No mapping found for comment');
    return { ignored: true, reason: 'no-mapping' };
  }

  try {
    await editThreadMessage(
      commentMapping.thread_id,
      commentMapping.discord_message_id,
      authorName,
      commentText
    );
    fastify.log.info({ ticketKey, jiraCommentId }, 'Discord message updated');

    return {
      success: true,
      ticketKey,
      jiraCommentId,
      action: 'updated',
    };
  } catch (error) {
    fastify.log.error(error, 'Failed to update Discord message');
    return reply.status(500).send({
      error: 'Failed to update Discord message',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// 코멘트 삭제 처리
async function handleCommentDeleted(
  fastify: FastifyInstance,
  payload: JiraWebhookPayload,
  reply: FastifyReply
) {
  if (!payload.issue || !payload.comment) {
    fastify.log.warn('No issue or comment in payload');
    return reply.status(400).send({ error: 'No issue or comment in payload' });
  }

  const ticketKey = payload.issue.key;
  const jiraCommentId = payload.comment.id;

  // 매핑된 Discord 메시지 찾기
  const commentMapping = getCommentMappingByJiraComment(jiraCommentId);
  if (!commentMapping) {
    fastify.log.info({ ticketKey, jiraCommentId }, 'No mapping found for comment');
    return { ignored: true, reason: 'no-mapping' };
  }

  try {
    await deleteThreadMessage(commentMapping.thread_id, commentMapping.discord_message_id);
    deleteCommentMappingByJiraComment(jiraCommentId);
    fastify.log.info({ ticketKey, jiraCommentId }, 'Discord message deleted');

    return {
      success: true,
      ticketKey,
      jiraCommentId,
      action: 'deleted',
    };
  } catch (error) {
    fastify.log.error(error, 'Failed to delete Discord message');
    return reply.status(500).send({
      error: 'Failed to delete Discord message',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// 이슈 삭제 처리
async function handleIssueDeleted(
  fastify: FastifyInstance,
  payload: JiraWebhookPayload,
  reply: FastifyReply
) {
  if (!payload.issue) {
    fastify.log.warn('No issue in payload');
    return reply.status(400).send({ error: 'No issue in payload' });
  }

  const ticketKey = payload.issue.key;

  // 매핑된 Discord 메시지/스레드 찾기
  const mapping = getMappingByTicketKey(ticketKey);
  if (!mapping) {
    fastify.log.info({ ticketKey }, 'No mapping found for ticket');
    return { ignored: true, reason: 'no-mapping' };
  }

  try {
    // Discord 메시지 + 스레드 삭제
    await deleteJiraNotification(mapping.channel_id, mapping.message_id, mapping.thread_id);

    // 매핑 정리
    deleteCommentMappingsByTicketKey(ticketKey);
    deleteMappingByThreadId(mapping.thread_id);

    fastify.log.info({ ticketKey }, 'Discord message and thread deleted');

    return {
      success: true,
      ticketKey,
      action: 'deleted',
    };
  } catch (error) {
    fastify.log.error(error, 'Failed to delete Discord message/thread');
    return reply.status(500).send({
      error: 'Failed to delete Discord message/thread',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
