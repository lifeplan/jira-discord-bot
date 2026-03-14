#!/bin/bash
# 문서 발행 스크립트 - Claude Code 등에서 AI 작업 결과물을 Confluence + Discord로 발행
#
# 사용법:
#   ./scripts/publish-document.sh \
#     --title "기획서 Part 1 — Background" \
#     --summary "핵심 문제 4건, 솔루션 5개 기능, 시장 규모 3단계" \
#     --author "지윤" \
#     --category "기획서" \
#     --url "https://lifeplan-app.atlassian.net/wiki/spaces/lifeplan/pages/12345"
#
# Confluence 페이지 자동 생성 (선택):
#   ./scripts/publish-document.sh \
#     --title "기획서 Part 1" \
#     --summary "요약 내용" \
#     --author "지윤" \
#     --category "기획서" \
#     --confluence-space-id "12345" \
#     --confluence-body "<p>HTML 내용</p>" \
#     --confluence-parent-id "67890"
#
# 환경변수:
#   DOCUMENT_WEBHOOK_SECRET - HMAC 서명용 시크릿 (필수)
#   BOT_URL - 봇 서버 URL (기본: http://localhost:3000)

set -euo pipefail

# 기본값
BOT_URL="${BOT_URL:-http://localhost:3000}"
SECRET="${DOCUMENT_WEBHOOK_SECRET:-}"
TITLE=""
SUMMARY=""
AUTHOR=""
CATEGORY=""
CONFLUENCE_URL=""
CONFLUENCE_SPACE_ID=""
CONFLUENCE_BODY=""
CONFLUENCE_PARENT_ID=""
HIGHLIGHTS=""
TAGS=""

# 인자 파싱
while [[ $# -gt 0 ]]; do
  case $1 in
    --title) TITLE="$2"; shift 2 ;;
    --summary) SUMMARY="$2"; shift 2 ;;
    --author) AUTHOR="$2"; shift 2 ;;
    --category) CATEGORY="$2"; shift 2 ;;
    --url) CONFLUENCE_URL="$2"; shift 2 ;;
    --confluence-space-id) CONFLUENCE_SPACE_ID="$2"; shift 2 ;;
    --confluence-body) CONFLUENCE_BODY="$2"; shift 2 ;;
    --confluence-parent-id) CONFLUENCE_PARENT_ID="$2"; shift 2 ;;
    --highlights) HIGHLIGHTS="$2"; shift 2 ;;  # 쉼표 구분 (예: "항목1,항목2,항목3")
    --tags) TAGS="$2"; shift 2 ;;              # 쉼표 구분 (예: "기획,MVP,Phase1")
    --secret) SECRET="$2"; shift 2 ;;
    --bot-url) BOT_URL="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# 필수 인자 검증
if [[ -z "$TITLE" || -z "$SUMMARY" || -z "$AUTHOR" ]]; then
  echo "Error: --title, --summary, --author are required"
  exit 1
fi

if [[ -z "$SECRET" ]]; then
  echo "Error: DOCUMENT_WEBHOOK_SECRET env var or --secret flag required"
  exit 1
fi

# JSON body 생성
JSON_BODY=$(cat <<EOF
{
  "title": $(echo "$TITLE" | jq -Rs .),
  "summary": $(echo "$SUMMARY" | jq -Rs .),
  "author": $(echo "$AUTHOR" | jq -Rs .)
EOF
)

# 선택 필드 추가
if [[ -n "$CATEGORY" ]]; then
  JSON_BODY="$JSON_BODY, \"category\": $(echo "$CATEGORY" | jq -Rs .)"
fi

if [[ -n "$CONFLUENCE_URL" ]]; then
  JSON_BODY="$JSON_BODY, \"confluenceUrl\": $(echo "$CONFLUENCE_URL" | jq -Rs .)"
fi

# Confluence 생성 옵션
if [[ -n "$CONFLUENCE_SPACE_ID" && -n "$CONFLUENCE_BODY" ]]; then
  CONFLUENCE_JSON="\"confluence\": { \"spaceId\": $(echo "$CONFLUENCE_SPACE_ID" | jq -Rs .), \"body\": $(echo "$CONFLUENCE_BODY" | jq -Rs .)"
  if [[ -n "$CONFLUENCE_PARENT_ID" ]]; then
    CONFLUENCE_JSON="$CONFLUENCE_JSON, \"parentId\": $(echo "$CONFLUENCE_PARENT_ID" | jq -Rs .)"
  fi
  CONFLUENCE_JSON="$CONFLUENCE_JSON }"
  JSON_BODY="$JSON_BODY, $CONFLUENCE_JSON"
fi

# highlights (쉼표 구분 → JSON 배열)
if [[ -n "$HIGHLIGHTS" ]]; then
  HIGHLIGHTS_JSON=$(echo "$HIGHLIGHTS" | jq -Rs 'split(",")')
  JSON_BODY="$JSON_BODY, \"highlights\": $HIGHLIGHTS_JSON"
fi

# tags (쉼표 구분 → JSON 배열)
if [[ -n "$TAGS" ]]; then
  TAGS_JSON=$(echo "$TAGS" | jq -Rs 'split(",")')
  JSON_BODY="$JSON_BODY, \"tags\": $TAGS_JSON"
fi

JSON_BODY="{ $JSON_BODY }"

# HMAC 서명 생성
TIMESTAMP=$(date +%s%3N)
SIGNATURE=$(echo -n "${JSON_BODY}${TIMESTAMP}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')

# 요청 전송
echo "📤 Publishing document: $TITLE"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BOT_URL}/webhook/document" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -d "$JSON_BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✅ Success! Response: $BODY"
else
  echo "❌ Failed (HTTP $HTTP_CODE): $BODY"
  exit 1
fi
