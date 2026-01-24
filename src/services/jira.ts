import { config } from '../config.js';

const auth = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64');

interface JiraApiError {
  status: number;
  message: string;
}

async function jiraFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${config.jira.host}/rest/api/3${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error: JiraApiError = {
      status: response.status,
      message: await response.text(),
    };
    throw new Error(`Jira API Error (${error.status}): ${error.message}`);
  }

  // 204 No Content 등의 경우
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// Jira 티켓에 코멘트 추가
export async function addComment(
  issueKey: string,
  content: string,
  authorName: string
): Promise<void> {
  await jiraFetch(`/issue/${issueKey}/comment`, {
    method: 'POST',
    body: JSON.stringify({
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `[Discord - ${authorName}]\n \n${content}`,
              },
            ],
          },
        ],
      },
    }),
  });
}

// Jira 이슈 정보 조회
export async function getIssue(issueKey: string): Promise<JiraIssue> {
  return jiraFetch<JiraIssue>(`/issue/${issueKey}`);
}

// Jira 이슈 타입
export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: {
      content?: Array<{
        content?: Array<{
          text?: string;
        }>;
      }>;
    };
    issuetype?: {
      name: string;
    };
    assignee?: {
      displayName: string;
    };
    priority?: {
      name: string;
    };
    status?: {
      name: string;
    };
  };
}

// Jira 코멘트 타입
export interface JiraComment {
  id: string;
  body?: string | {
    content?: Array<{
      content?: Array<{
        text?: string;
      }>;
    }>;
  };
  author?: {
    displayName: string;
  };
}

// Jira Webhook 페이로드 타입
export interface JiraWebhookPayload {
  webhookEvent: string;
  issue: JiraIssue;
  comment?: JiraComment;
  user?: {
    displayName: string;
  };
}

// Jira ADF(Atlassian Document Format)에서 텍스트 추출
function extractTextFromADF(node: unknown): string {
  if (!node || typeof node !== 'object') return '';

  const n = node as Record<string, unknown>;

  // 텍스트 노드
  if (n.type === 'text' && typeof n.text === 'string') {
    return n.text;
  }

  // 하위 content가 있으면 재귀적으로 추출
  if (Array.isArray(n.content)) {
    return n.content.map(extractTextFromADF).join('');
  }

  return '';
}

// Jira 코멘트 본문 추출
export function extractCommentText(comment: JiraComment): string {
  if (!comment.body) return '';

  // body가 문자열인 경우 (Jira Webhook 기본 형식)
  if (typeof comment.body === 'string') {
    return comment.body;
  }

  // body가 ADF 객체인 경우
  if (comment.body.content) {
    return comment.body.content
      .map(extractTextFromADF)
      .join('\n')
      .trim();
  }

  return '';
}
