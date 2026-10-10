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
