import type { ChatRequest, ChatResponse } from '../types/chat';

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
