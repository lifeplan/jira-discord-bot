import 'dotenv/config';

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  server: {
    port: Number(optional('PORT', '3000')),
    nodeEnv: optional('NODE_ENV', 'development'),
    // Render에서 자동 제공하는 외부 URL (self-ping용)
    externalUrl: process.env.RENDER_EXTERNAL_URL ?? process.env.EXTERNAL_URL ?? '',
  },
  discord: {
    token: required('DISCORD_BOT_TOKEN'),
    channelId: required('DISCORD_CHANNEL_ID'),
  },
  jira: {
    host: required('JIRA_HOST'),
    email: required('JIRA_EMAIL'),
    apiToken: required('JIRA_API_TOKEN'),
    projectKey: optional('JIRA_PROJECT_KEY', ''),
  },
} as const;
