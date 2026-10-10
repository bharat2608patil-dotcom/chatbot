export type ChatRole = 'user' | 'assistant';

export interface ChatRequest {
  question: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  references?: string[];
}

export interface ChatResponse {
  answer: string;
  rootCause: string;
  recommendedActions: string[];
  references: string[];
  timestamp: string;
}

export interface KnowledgeFile {
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
}
