import { supabase } from './index.js';

export type ErrorSource =
  | 'webhook:issue_created'
  | 'webhook:issue_updated'
  | 'webhook:issue_deleted'
  | 'webhook:comment_created'
  | 'webhook:comment_updated'
  | 'webhook:comment_deleted'
  | 'webhook:meeting'
  | 'discord:message_create'
  | 'discord:message_update'
  | 'discord:message_delete'
  | 'discord:login'
  | 'discord:command'
  | 'discord:client'
  | 'supabase:keepalive';

export async function logError(
  source: ErrorSource,
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  try {
    await supabase.from('error_logs').insert({
      source,
      message,
      stack,
      context: context ?? null,
    });
  } catch {
    // DB 로깅 실패 시 콘솔에만 출력 (무한 루프 방지)
    console.error('[error_logs] Failed to save:', { source, message });
  }
}
