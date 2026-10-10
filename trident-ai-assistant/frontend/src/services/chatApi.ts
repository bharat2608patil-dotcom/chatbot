import type { ChatMessage, ChatRequest, ChatResponse, KnowledgeAuthStatus, KnowledgeFile } from '../types/chat';

export async function getKnowledgeAuthStatus(): Promise<KnowledgeAuthStatus> {
  const response = await fetch('/api/auth/status');
  const data = (await response.json()) as KnowledgeAuthStatus & { message?: string };

  if (!response.ok || typeof data.configured !== 'boolean' || typeof data.authenticated !== 'boolean') {
    throw new Error(data.message ?? 'Unable to check knowledge management access.');
  }

  return data;
}

async function submitKnowledgeCredentials(
  endpoint: '/api/auth/setup' | '/api/auth/login',
  username: string,
  password: string,
  setupCode?: string,
): Promise<KnowledgeAuthStatus> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, ...(setupCode ? { setupCode } : {}) }),
  });
  const data = (await response.json()) as KnowledgeAuthStatus & { ok?: boolean; message?: string };

  if (!response.ok || data.ok !== true || !data.authenticated || typeof data.csrfToken !== 'string') {
    throw new Error(data.message ?? 'Knowledge management authentication failed.');
  }

  return { configured: data.configured, authenticated: data.authenticated, csrfToken: data.csrfToken };
}

export function setupKnowledgeAdmin(username: string, password: string, setupCode: string): Promise<KnowledgeAuthStatus> {
  return submitKnowledgeCredentials('/api/auth/setup', username, password, setupCode);
}

export function loginKnowledgeAdmin(username: string, password: string): Promise<KnowledgeAuthStatus> {
  return submitKnowledgeCredentials('/api/auth/login', username, password);
}

export async function logoutKnowledgeAdmin(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  const data = (await response.json()) as { ok?: boolean; message?: string };
  if (!response.ok || data.ok !== true) {
    throw new Error(data.message ?? 'Unable to log out of knowledge management.');
  }
}

export async function loadChatHistory(): Promise<ChatMessage[]> {
  const response = await fetch('/api/chat/history?limit=100');
  const data = (await response.json()) as { messages?: ChatMessage[]; message?: string };

  if (!response.ok || !Array.isArray(data.messages)) {
    throw new Error(data.message ?? 'Unable to load chat history.');
  }

  return data.messages;
}

export async function sendChatQuestion(question: string): Promise<ChatResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question } satisfies ChatRequest),
  });

  const data = (await response.json()) as ChatResponse & { message?: string; ok?: boolean };

  if (!response.ok || data.ok === false) {
    throw new Error(data.message ?? 'Unable to reach the Trident assistant.');
  }

  return data;
}

export interface KnowledgeUploadResponse {
  fileName: string;
  sizeBytes: number;
}

export async function uploadKnowledgeFile(file: File, csrfToken: string): Promise<KnowledgeUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/knowledge/upload', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: formData,
  });
  const data = (await response.json()) as {
    ok?: boolean;
    message?: string;
    fileName?: string;
    sizeBytes?: number;
  };

  if (!response.ok || data.ok !== true || !data.fileName || data.sizeBytes === undefined) {
    throw new Error(response.status === 401 ? 'Knowledge management login required.' : data.message ?? 'Unable to upload the knowledge file.');
  }

  return {
    fileName: data.fileName,
    sizeBytes: data.sizeBytes,
  };
}

export async function getKnowledgeFiles(): Promise<KnowledgeFile[]> {
  const response = await fetch('/api/knowledge');
  const data = (await response.json()) as { files?: KnowledgeFile[]; message?: string };

  if (!response.ok || !Array.isArray(data.files)) {
    throw new Error(response.status === 401 ? 'Knowledge management login required.' : data.message ?? 'Unable to load knowledge files.');
  }

  return data.files;
}

export async function deleteKnowledgeFile(relativePath: string, csrfToken: string): Promise<void> {
  const response = await fetch(`/api/knowledge?path=${encodeURIComponent(relativePath)}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  });
  const data = (await response.json()) as { ok?: boolean; message?: string };

  if (!response.ok || data.ok !== true) {
    throw new Error(response.status === 401 ? 'Knowledge management login required.' : data.message ?? 'Unable to delete the knowledge file.');
  }
}
