import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { config } from '../config.js';
import { sendDocumentNotification } from '../services/discord.js';
import { createConfluencePage } from '../services/confluence.js';
import { logError } from '../database/errorLogs.js';

// HMAC 검증 (5분 이내 요청만 허용)
const MAX_AGE_MS = 5 * 60 * 1000;

interface DocumentWebhookBody {
  // 문서 정보
  title: string;
  summary: string;
  author: string;
  category?: string; // 기획서, 회의록, 기술문서, 리서치 등

  // Confluence 페이지 생성 (선택)
  confluence?: {
    spaceId: string;
    body: string; // HTML storage format
    parentId?: string;
  };

  // 이미 Confluence에 올린 경우
  confluenceUrl?: string;

  // 추가 정보
  highlights?: string[];
  tags?: string[];
}

// fastify-raw-body 플러그인이 추가하는 타입
interface RawBodyRequest extends FastifyRequest {
  rawBody?: string | Buffer;
}

function verifyHmacSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum) || Date.now() - timestampNum > MAX_AGE_MS) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body + timestamp)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// 카테고리별 이모지
const CATEGORY_EMOJI: Record<string, string> = {
  '기획서': '📝',
  '회의록': '📋',
  '기술문서': '🔧',
  '리서치': '🔍',
  '디자인': '🎨',
  '보고서': '📊',
  '기타': '📄',
};

export async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  // 문서 발행 Webhook 수신
  fastify.post(
    '/webhook/document',
    {
      config: {
        rawBody: true,
      },
    },
    async (request: RawBodyRequest, reply: FastifyReply) => {
      // meeting과 동일한 채널/시크릿 사용 (별도 설정 시 오버라이드 가능)
      const secret = config.document.webhookSecret || config.meeting.webhookSecret;
      const channelId = config.document.channelId || config.meeting.channelId;

      if (!secret || !channelId) {
        fastify.log.error('Webhook secret or channel ID not configured');
        return reply.status(500).send({ error: 'Server not configured for document webhooks' });
      }

      // HMAC 검증
      const signature = request.headers['x-signature'] as string;
      const timestamp = request.headers['x-timestamp'] as string;

      if (!signature || !timestamp) {
        return reply.status(401).send({ error: 'Missing authentication headers' });
      }

      if (!request.rawBody) {
        return reply.status(500).send({ error: 'Server configuration error' });
      }

      const rawBodyStr = typeof request.rawBody === 'string'
        ? request.rawBody
        : request.rawBody.toString('utf-8');
      const isValid = verifyHmacSignature(rawBodyStr, timestamp, signature, secret);

      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid signature or request expired' });
      }

      const body = request.body as DocumentWebhookBody;

      if (!body.title || !body.summary || !body.author) {
        return reply.status(400).send({
          error: 'Missing required fields: title, summary, author',
        });
      }

      try {
        let confluenceUrl = body.confluenceUrl;

        // Confluence 페이지 생성 요청이 있으면 먼저 생성
        if (body.confluence && !confluenceUrl) {
          const result = await createConfluencePage({
            spaceId: body.confluence.spaceId,
            title: body.title,
            body: body.confluence.body,
            parentId: body.confluence.parentId,
          });
          confluenceUrl = result.pageUrl;
          fastify.log.info({ pageUrl: result.pageUrl }, 'Confluence page created');
        }

        // Discord에 알림 전송
        const emoji = CATEGORY_EMOJI[body.category ?? '기타'] ?? '📄';

        const messageId = await sendDocumentNotification(channelId, {
          title: body.title,
          summary: body.summary,
          author: body.author,
          emoji,
          category: body.category,
          confluenceUrl,
          highlights: body.highlights,
          tags: body.tags,
        });

        fastify.log.info({ title: body.title, messageId }, 'Document notification sent to Discord');

        return {
          success: true,
          messageId,
          confluenceUrl,
        };
      } catch (error) {
        fastify.log.error(error, 'Failed to process document webhook');
        logError('webhook:document', error, { title: body.title, author: body.author });
        return reply.status(500).send({
          error: 'Failed to process document webhook',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
