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

// ADF 노드 타입
interface ADFNode {
  type: string;
  text?: string;
  content?: ADFNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

// Jira ADF(Atlassian Document Format)를 Discord Markdown으로 변환
function convertADFToMarkdown(node: unknown, listDepth = 0): string {
  if (!node || typeof node !== 'object') return '';

  const n = node as ADFNode;

  // 텍스트 노드 처리 (marks 적용)
  if (n.type === 'text' && typeof n.text === 'string') {
    let text = n.text;

    if (n.marks) {
      for (const mark of n.marks) {
        switch (mark.type) {
          case 'strong':
            text = `**${text}**`;
            break;
          case 'em':
            text = `*${text}*`;
            break;
          case 'code':
            text = `\`${text}\``;
            break;
          case 'strike':
            text = `~~${text}~~`;
            break;
          case 'link':
            const href = mark.attrs?.href as string;
            if (href) text = `[${text}](${href})`;
            break;
        }
      }
    }
    return text;
  }

  // 컨텐츠가 있는 노드 처리
  const children = n.content?.map(child => convertADFToMarkdown(child, listDepth)).join('') ?? '';

  switch (n.type) {
    case 'doc':
      return n.content?.map(child => convertADFToMarkdown(child, listDepth)).join('\n\n') ?? '';

    case 'paragraph':
      return children;

    case 'heading': {
      const level = (n.attrs?.level as number) ?? 1;
      const prefix = '#'.repeat(Math.min(level, 3)); // Discord는 ###까지만 지원
      return `${prefix} ${children}`;
    }

    case 'bulletList':
      return n.content?.map(child => convertADFToMarkdown(child, listDepth)).join('\n') ?? '';

    case 'orderedList':
      return n.content?.map((child, i) => {
        const itemContent = convertADFToMarkdown(child, listDepth);
        return itemContent.replace(/^- /, `${i + 1}. `);
      }).join('\n') ?? '';

    case 'listItem': {
      const indent = '  '.repeat(listDepth);
      const itemContent = n.content?.map(child => convertADFToMarkdown(child, listDepth + 1)).join('') ?? '';
      return `${indent}- ${itemContent}`;
    }

    case 'codeBlock': {
      const language = (n.attrs?.language as string) ?? '';
      return `\`\`\`${language}\n${children}\n\`\`\``;
    }

    case 'blockquote':
      return children.split('\n').map(line => `> ${line}`).join('\n');

    case 'rule':
      return '---';

    case 'hardBreak':
      return '\n';

    case 'mention':
      return `@${n.attrs?.text ?? 'user'}`;

    case 'emoji':
      return n.attrs?.shortName as string ?? '';

    default:
      return children;
  }
}

// 단순 텍스트만 추출 (기존 호환용)
function extractTextFromADF(node: unknown): string {
  if (!node || typeof node !== 'object') return '';

  const n = node as ADFNode;

  if (n.type === 'text' && typeof n.text === 'string') {
    return n.text;
  }

  if (Array.isArray(n.content)) {
    return n.content.map(extractTextFromADF).join('');
  }

  return '';
}

// Jira 코멘트 본문 추출 (Discord Markdown으로 변환)
export function extractCommentText(comment: JiraComment): string {
  if (!comment.body) return '';

  // body가 문자열인 경우 (Jira Webhook 기본 형식)
  if (typeof comment.body === 'string') {
    return comment.body;
  }

  // body가 ADF 객체인 경우 - Markdown으로 변환
  if (comment.body.content) {
    return convertADFToMarkdown({ type: 'doc', content: comment.body.content });
  }

  return '';
}

// Jira 설명(description) 추출 (Discord Markdown으로 변환)
export function extractDescriptionMarkdown(description: JiraIssue['fields']['description']): string {
  if (!description?.content) return '';
  return convertADFToMarkdown({ type: 'doc', content: description.content });
}

// 단순 텍스트만 추출 (설명 미리보기용)
export function extractDescriptionText(description: JiraIssue['fields']['description']): string {
  if (!description?.content) return '';
  return description.content.map(extractTextFromADF).join('\n').trim();
}
