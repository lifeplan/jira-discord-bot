# CLAUDE.md

이 파일은 Claude Code가 이 프로젝트를 이해하는 데 필요한 정보를 담고 있습니다.

## 패키지 매니저

- **pnpm** 사용 (npm, yarn 아님)
- 설치: `pnpm install`
- 패키지 추가: `pnpm add <package>`
- 개발 의존성: `pnpm add -D <package>`

## 빌드 및 실행

```bash
pnpm build    # TypeScript 컴파일
pnpm start    # 프로덕션 실행
pnpm dev      # 개발 모드 (watch)
```

## 프로젝트 구조

- `src/` - TypeScript 소스
- `dist/` - 컴파일된 JavaScript

## 데이터베이스

- **Supabase PostgreSQL** 사용 (외부 호스팅)
- 환경변수: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- 환경변수 추가/변경 시 `.env.example`도 함께 업데이트할 것
