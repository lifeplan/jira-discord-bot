import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';
import { Events, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { discordClient, loginDiscord } from './services/discord.js';
import { webhookRoutes } from './routes/webhook.js';
import { meetingRoutes } from './routes/meeting.js';
import { handleMessageCreate } from './events/messageCreate.js';
import { handleMessageUpdate } from './events/messageUpdate.js';
import { handleMessageDelete } from './events/messageDelete.js';
import { registerCommands, commands } from './commands/index.js';
import { logError } from './database/errorLogs.js';

// DB 초기화 (import 시 자동 실행)
import './database/index.js';

// Fastify 서버 초기화
const server = Fastify({
  logger: {
    level: config.server.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

// rawBody 플러그인 등록 (HMAC 서명 검증용)
server.register(rawBody, {
  runFirst: true, // 다른 파서보다 먼저 실행
});

// Health check 엔드포인트
server.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    discord: discordClient.ws.status === 0 ? 'connected' : discordClient.isReady() ? 'ready' : 'disconnected',
    uptime: process.uptime(),
  };
});

// Webhook 라우트 등록
server.register(webhookRoutes);
server.register(meetingRoutes);

// Discord 에러 로깅
discordClient.on('error', (error) => {
  server.log.error(error, 'Discord client error');
  logError('discord:client', error);
});

// Discord 봇 Ready 이벤트
discordClient.once(Events.ClientReady, async (client) => {
  server.log.info(`Discord bot ready: ${client.user.tag}`);

  // 슬래시 커맨드 등록
  try {
    await registerCommands(client.user.id);
    server.log.info('Slash commands registered');
  } catch (error) {
    server.log.error(error, 'Failed to register slash commands');
    logError('discord:command', error);
  }
});

// 슬래시 커맨드 처리
discordClient.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.find(cmd => cmd.data.name === interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction as ChatInputCommandInteraction);
  } catch (error) {
    server.log.error(error, 'Failed to execute command');
    logError('discord:command', error, { command: interaction.commandName });
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '명령어 실행 중 오류가 발생했습니다.', flags: [MessageFlags.Ephemeral] });
    } else {
      await interaction.reply({ content: '명령어 실행 중 오류가 발생했습니다.', flags: [MessageFlags.Ephemeral] });
    }
  }
});

// Discord 메시지 이벤트 (스레드 댓글 감지)
discordClient.on(Events.MessageCreate, handleMessageCreate);

// Discord 메시지 수정 이벤트 (Jira 코멘트 수정 동기화)
discordClient.on(Events.MessageUpdate, handleMessageUpdate);

// Discord 메시지 삭제 이벤트 (Jira 코멘트 삭제 동기화)
discordClient.on(Events.MessageDelete, handleMessageDelete);

// 스레드 삭제 이벤트 (매핑 정리)
discordClient.on(Events.ThreadDelete, async (thread) => {
  const { deleteMappingByThreadId } = await import('./database/mappings.js');
  deleteMappingByThreadId(thread.id);
  server.log.info({ threadId: thread.id }, 'Thread deleted, mapping removed');
});

// Supabase keepalive (24시간마다 조회하여 무료 티어 일시정지 방지)
const KEEPALIVE_INTERVAL = 24 * 60 * 60 * 1000;
let keepaliveIntervalId: NodeJS.Timeout | null = null;

function startSupabaseKeepalive(): void {
  keepaliveIntervalId = setInterval(async () => {
    try {
      const { getAllMappings } = await import('./database/mappings.js');
      const mappings = await getAllMappings();
      server.log.info(`Supabase keepalive: ${mappings.length} mappings`);
    } catch (error) {
      server.log.warn({ error }, 'Supabase keepalive failed');
      logError('supabase:keepalive', error);
    }
  }, KEEPALIVE_INTERVAL);
}

// 서버 시작
async function start(): Promise<void> {
  try {
    // HTTP 서버 시작
    await server.listen({
      port: config.server.port,
      host: '0.0.0.0',
    });

    server.log.info(`Server running on port ${config.server.port}`);
    server.log.info(`Environment: ${config.server.nodeEnv}`);

    // Supabase keepalive 시작
    startSupabaseKeepalive();

    // Discord 봇 로그인
    server.log.info('Logging in to Discord...');
    loginDiscord().catch((err) => {
      server.log.error(err, 'Discord login error');
      logError('discord:login', err);
    });
  } catch (err) {
    server.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  server.log.info('Shutting down...');
  if (keepaliveIntervalId) clearInterval(keepaliveIntervalId);
  await server.close();
  discordClient.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.log.info('Shutting down...');
  if (keepaliveIntervalId) clearInterval(keepaliveIntervalId);
  await server.close();
  discordClient.destroy();
  process.exit(0);
});

start();
