import Fastify from 'fastify';
import { Events, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { discordClient, loginDiscord } from './services/discord.js';
import { webhookRoutes } from './routes/webhook.js';
import { meetingRoutes } from './routes/meeting.js';
import { handleMessageCreate } from './events/messageCreate.js';
import { handleMessageUpdate } from './events/messageUpdate.js';
import { handleMessageDelete } from './events/messageDelete.js';
import { registerCommands, commands } from './commands/index.js';

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
server.register(meetingRoutes);

// Discord 봇 이벤트
discordClient.once(Events.ClientReady, async (client) => {
  server.log.info(`Discord bot logged in as ${client.user.tag}`);

  // 슬래시 커맨드 등록
  try {
    await registerCommands(client.user.id);
    server.log.info('Slash commands registered');
  } catch (error) {
    server.log.error(error, 'Failed to register slash commands');
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

// Self-ping으로 Render 무료 티어 sleep 방지 (5분 간격)
const PING_INTERVAL = 5 * 60 * 1000; // 5분
let pingIntervalId: NodeJS.Timeout | null = null;

function startSelfPing(): void {
  const externalUrl = config.server.externalUrl;

  if (!externalUrl) {
    server.log.info('No EXTERNAL_URL configured, self-ping disabled');
    return;
  }

  server.log.info(`Self-ping enabled: ${externalUrl}/health (every 5 minutes)`);

  pingIntervalId = setInterval(async () => {
    try {
      const response = await fetch(`${externalUrl}/health`);
      if (response.ok) {
        server.log.debug('Self-ping successful');
      } else {
        server.log.warn(`Self-ping failed: ${response.status}`);
      }
    } catch (error) {
      server.log.warn({ error }, 'Self-ping error');
    }
  }, PING_INTERVAL);
}

function stopSelfPing(): void {
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
  }
}

// 서버 시작
async function start(): Promise<void> {
  try {
    // HTTP 서버 먼저 시작 (Render 포트 감지를 위해)
    await server.listen({
      port: config.server.port,
      host: '0.0.0.0',
    });

    server.log.info(`Server running on port ${config.server.port}`);
    server.log.info(`Environment: ${config.server.nodeEnv}`);

    // Self-ping 시작 (Render sleep 방지)
    startSelfPing();

    // Discord 봇 로그인 (서버 시작 후 백그라운드에서)
    server.log.info('Logging in to Discord...');
    loginDiscord().catch((err) => {
      server.log.error(err, 'Failed to login to Discord');
    });
  } catch (err) {
    server.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  server.log.info('Shutting down...');
  stopSelfPing();
  await server.close();
  discordClient.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.log.info('Shutting down...');
  stopSelfPing();
  await server.close();
  discordClient.destroy();
  process.exit(0);
});

start();
