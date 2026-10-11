import type { ChatMessage, ChatRequest, ChatResponse, KnowledgeFile } from '../types/chat';

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

export interface KnowledgeAuthStatus {
  configured: boolean;
  authenticated: boolean;
}

async function readApiResponse<T extends { message?: string }>(response: Response): Promise<T> {
  const data = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(data.message ?? 'The request could not be completed.');
  }
  return data;
}

export async function getKnowledgeAuthStatus(): Promise<KnowledgeAuthStatus> {
  const response = await fetch('/api/knowledge/auth/status');
  const data = await readApiResponse<KnowledgeAuthStatus & { message?: string }>(response);
  return {
    configured: data.configured,
    authenticated: data.authenticated,
  };
}

export async function setupKnowledgeAdmin(username: string, password: string): Promise<void> {
  const response = await fetch('/api/knowledge/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await readApiResponse<{ ok?: boolean; message?: string }>(response);
  if (data.ok !== true) throw new Error(data.message ?? 'Knowledge administrator setup failed.');
}

export async function loginKnowledgeAdmin(username: string, password: string): Promise<void> {
  const response = await fetch('/api/knowledge/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await readApiResponse<{ ok?: boolean; message?: string }>(response);
  if (data.ok !== true) throw new Error(data.message ?? 'Knowledge administrator login failed.');
}

export async function logoutKnowledgeAdmin(): Promise<void> {
  const response = await fetch('/api/knowledge/auth/logout', { method: 'POST' });
  const data = await readApiResponse<{ ok?: boolean; message?: string }>(response);
  if (data.ok !== true) throw new Error(data.message ?? 'Knowledge administrator logout failed.');
}

export async function uploadKnowledgeFile(file: File): Promise<KnowledgeUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/knowledge/upload', {
    method: 'POST',
    body: formData,
  });
  const data = (await response.json()) as {
    ok?: boolean;
    message?: string;
    fileName?: string;
    sizeBytes?: number;
  };

  if (!response.ok || data.ok !== true || !data.fileName || data.sizeBytes === undefined) {
    throw new Error(data.message ?? 'Unable to upload the knowledge file.');
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
    throw new Error(data.message ?? 'Unable to load knowledge files.');
  }

  return data.files;
}

export async function deleteKnowledgeFile(relativePath: string): Promise<void> {
  const response = await fetch(`/api/knowledge?path=${encodeURIComponent(relativePath)}`, {
    method: 'DELETE',
  });
  const data = (await response.json()) as { ok?: boolean; message?: string };

  if (!response.ok || data.ok !== true) {
    throw new Error(data.message ?? 'Unable to delete the knowledge file.');
  }
}

export async function clearChatHistory(): Promise<void> {
  const response = await fetch('/api/chat/history', { method: 'DELETE' });
  const data = await response.json() as { ok?: boolean; message?: string };
  if (!response.ok || data.ok !== true) {
    throw new Error(data.message ?? 'Unable to clear chat history.');
  }
}
