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
BOT_URL="${BOT_URL:-https://sdpg.shop}"
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

# jq로 안전하게 JSON 생성
JSON_BODY=$(jq -n \
  --arg title "$TITLE" \
  --arg summary "$SUMMARY" \
  --arg author "$AUTHOR" \
  '{title: $title, summary: $summary, author: $author}')

# 선택 필드 추가
if [[ -n "$CATEGORY" ]]; then
  JSON_BODY=$(echo "$JSON_BODY" | jq --arg v "$CATEGORY" '. + {category: $v}')
fi

if [[ -n "$CONFLUENCE_URL" ]]; then
  JSON_BODY=$(echo "$JSON_BODY" | jq --arg v "$CONFLUENCE_URL" '. + {confluenceUrl: $v}')
fi

# Confluence 생성 옵션
if [[ -n "$CONFLUENCE_SPACE_ID" && -n "$CONFLUENCE_BODY" ]]; then
  if [[ -n "$CONFLUENCE_PARENT_ID" ]]; then
    JSON_BODY=$(echo "$JSON_BODY" | jq \
      --arg sid "$CONFLUENCE_SPACE_ID" \
      --arg body "$CONFLUENCE_BODY" \
      --arg pid "$CONFLUENCE_PARENT_ID" \
      '. + {confluence: {spaceId: $sid, body: $body, parentId: $pid}}')
  else
    JSON_BODY=$(echo "$JSON_BODY" | jq \
      --arg sid "$CONFLUENCE_SPACE_ID" \
      --arg body "$CONFLUENCE_BODY" \
      '. + {confluence: {spaceId: $sid, body: $body}}')
  fi
fi

# highlights (쉼표 구분 → JSON 배열)
if [[ -n "$HIGHLIGHTS" ]]; then
  JSON_BODY=$(echo "$JSON_BODY" | jq --arg v "$HIGHLIGHTS" '. + {highlights: ($v | split(","))}')
fi

# tags (쉼표 구분 → JSON 배열)
if [[ -n "$TAGS" ]]; then
  JSON_BODY=$(echo "$JSON_BODY" | jq --arg v "$TAGS" '. + {tags: ($v | split(","))}')
fi

# compact JSON (한 줄로)
JSON_BODY=$(echo "$JSON_BODY" | jq -c .)

# HMAC 서명 생성 (macOS date는 %3N 미지원이므로 000 고정)
TIMESTAMP=$(date +%s)000
SIGNATURE=$(echo -n "${JSON_BODY}${TIMESTAMP}" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')

# 요청 전송
echo "📤 Publishing document: $TITLE"
HTTP_CODE=$(curl -s -o /tmp/publish-doc-response.json -w "%{http_code}" \
  -X POST "${BOT_URL}/webhook/document" \
  -H "Content-Type: application/json" \
  -H "X-Signature: $SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -d "$JSON_BODY")

RESPONSE_BODY=$(cat /tmp/publish-doc-response.json 2>/dev/null || echo "")
rm -f /tmp/publish-doc-response.json

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✅ Success! Response: $RESPONSE_BODY"
else
  echo "❌ Failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
  exit 1
fi
