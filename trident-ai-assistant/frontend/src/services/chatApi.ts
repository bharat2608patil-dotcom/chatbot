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
