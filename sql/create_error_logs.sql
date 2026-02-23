create table error_logs (
  id bigint generated always as identity primary key,
  source text not null,
  message text not null,
  stack text,
  context jsonb,
  created_at timestamptz default now()
);

-- 오래된 로그 자동 정리용 인덱스
create index idx_error_logs_created_at on error_logs (created_at);
