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
  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
  },
  meeting: {
    webhookSecret: optional('MEETING_WEBHOOK_SECRET', ''),
    channelId: optional('MEETING_CHANNEL_ID', ''), // #문서-노티 채널 ID
  },
  document: {
    webhookSecret: optional('DOCUMENT_WEBHOOK_SECRET', ''),
    channelId: optional('DOCUMENT_CHANNEL_ID', ''), // 미설정 시 MEETING_CHANNEL_ID 사용
  },
} as const;
