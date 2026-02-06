import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { config } from '../config.js';
import { sendMeetingSummary } from '../services/discord.js';

// HMAC 검증 (5분 이내 요청만 허용)
const MAX_AGE_MS = 5 * 60 * 1000;

interface MeetingWebhookBody {
  title: string;
  date: string;
  summary: string;
  confluenceUrl?: string;
  highlights?: string[];
}

function verifyHmacSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  // 1. Timestamp 검증 (5분 이내)
  const timestampNum = parseInt(timestamp, 10);
  if (isNaN(timestampNum) || Date.now() - timestampNum > MAX_AGE_MS) {
    return false;
  }

  // 2. HMAC 서명 검증
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body + timestamp)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function meetingRoutes(fastify: FastifyInstance): Promise<void> {
  // 회의록 요약 Webhook 수신
  fastify.post(
    '/webhook/meeting',
    {
      config: {
        rawBody: true, // HMAC 검증을 위해 원본 body 필요
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const secret = config.meeting.webhookSecret;
      const channelId = config.meeting.channelId;

      // 환경변수 체크
      if (!secret || !channelId) {
        fastify.log.error('MEETING_WEBHOOK_SECRET or MEETING_CHANNEL_ID not configured');
        return reply.status(500).send({ error: 'Server not configured for meeting webhooks' });
      }

      // 헤더에서 서명과 타임스탬프 추출
      const signature = request.headers['x-signature'] as string;
      const timestamp = request.headers['x-timestamp'] as string;

      if (!signature || !timestamp) {
        fastify.log.warn('Missing signature or timestamp headers');
        return reply.status(401).send({ error: 'Missing authentication headers' });
      }

      // HMAC 검증
      const rawBody = JSON.stringify(request.body);
      const isValid = verifyHmacSignature(rawBody, timestamp, signature, secret);

      if (!isValid) {
        fastify.log.warn('Invalid HMAC signature or expired request');
        return reply.status(401).send({ error: 'Invalid signature or request expired' });
      }

      // 요청 본문 파싱
      const body = request.body as MeetingWebhookBody;

      if (!body.title || !body.date || !body.summary) {
        fastify.log.warn('Missing required fields in meeting webhook');
        return reply.status(400).send({ error: 'Missing required fields: title, date, summary' });
      }

      try {
        // Discord에 회의록 요약 전송
        const messageId = await sendMeetingSummary(channelId, {
          title: body.title,
          date: body.date,
          summary: body.summary,
          confluenceUrl: body.confluenceUrl,
          highlights: body.highlights,
        });

        fastify.log.info({ title: body.title, messageId }, 'Meeting summary sent to Discord');

        return {
          success: true,
          messageId,
        };
      } catch (error) {
        fastify.log.error(error, 'Failed to send meeting summary to Discord');
        return reply.status(500).send({
          error: 'Failed to send meeting summary',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
