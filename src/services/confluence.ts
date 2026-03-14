import { config } from '../config.js';

const auth = Buffer.from(`${config.jira.email}:${config.jira.apiToken}`).toString('base64');

interface ConfluenceApiError {
  status: number;
  message: string;
}

async function confluenceFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${config.jira.host}/wiki/api/v2${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error: ConfluenceApiError = {
      status: response.status,
      message: await response.text(),
    };
    throw new Error(`Confluence API Error (${error.status}): ${error.message}`);
  }

  return response.json() as Promise<T>;
}

// Confluence 페이지 생성 응답
interface ConfluencePage {
  id: string;
  title: string;
  _links: {
    base: string;
    webui: string;
  };
}

export interface CreatePageParams {
  spaceId: string;
  title: string;
  body: string; // HTML 또는 storage format
  parentId?: string;
}

// Confluence 페이지 생성
export async function createConfluencePage(params: CreatePageParams): Promise<{
  pageId: string;
  pageUrl: string;
}> {
  const requestBody: Record<string, unknown> = {
    spaceId: params.spaceId,
    title: params.title,
    status: 'current',
    body: {
      representation: 'storage',
      value: params.body,
    },
  };

  if (params.parentId) {
    requestBody.parentId = params.parentId;
  }

  const page = await confluenceFetch<ConfluencePage>('/pages', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });

  const pageUrl = `${config.jira.host}/wiki${page._links.webui}`;

  return {
    pageId: page.id,
    pageUrl,
  };
}

// Confluence 페이지 업데이트
export async function updateConfluencePage(
  pageId: string,
  title: string,
  body: string,
  version: number
): Promise<{ pageUrl: string }> {
  const page = await confluenceFetch<ConfluencePage>(`/pages/${pageId}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: pageId,
      title,
      status: 'current',
      body: {
        representation: 'storage',
        value: body,
      },
      version: {
        number: version,
        message: 'Updated via Jira Discord Bot',
      },
    }),
  });

  const pageUrl = `${config.jira.host}/wiki${page._links.webui}`;
  return { pageUrl };
}
