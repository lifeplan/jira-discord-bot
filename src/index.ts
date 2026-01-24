import Fastify from 'fastify';
import { Events } from 'discord.js';
import { config } from './config.js';
import { discordClient, loginDiscord } from './services/discord.js';
import { webhookRoutes } from './routes/webhook.js';
import { handleMessageCreate } from './events/messageCreate.js';

// DB 초기화 (import 시 자동 실행)
import './database/index.js';

// Fastify 서버 초기화
const server = Fastify({
  logger: {
    level: config.server.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

// Health check 엔드포인트
server.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    discord: discordClient.isReady() ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  };
});

// Webhook 라우트 등록
server.register(webhookRoutes);

// Discord 봇 이벤트
discordClient.once(Events.ClientReady, (client) => {
  server.log.info(`Discord bot logged in as ${client.user.tag}`);
});

// Discord 메시지 이벤트 (스레드 댓글 감지)
discordClient.on(Events.MessageCreate, handleMessageCreate);

// 스레드 삭제 이벤트 (매핑 정리)
discordClient.on(Events.ThreadDelete, async (thread) => {
  const { deleteMappingByThreadId } = await import('./database/mappings.js');
  deleteMappingByThreadId(thread.id);
  server.log.info({ threadId: thread.id }, 'Thread deleted, mapping removed');
});

// 서버 시작
async function start(): Promise<void> {
  try {
    // Discord 봇 로그인
    server.log.info('Logging in to Discord...');
    await loginDiscord();

    // HTTP 서버 시작
    await server.listen({
      port: config.server.port,
      host: '0.0.0.0',
    });

    server.log.info(`Server running on port ${config.server.port}`);
    server.log.info(`Environment: ${config.server.nodeEnv}`);
  } catch (err) {
    server.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  server.log.info('Shutting down...');
  await server.close();
  discordClient.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.log.info('Shutting down...');
  await server.close();
  discordClient.destroy();
  process.exit(0);
});

start();
