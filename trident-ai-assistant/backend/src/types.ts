export interface ChatRequest {
  question: string;
}

export interface ChatResponse {
  answer: string;
  rootCause: string;
  recommendedActions: string[];
  references: string[];
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  references?: string[];
}

export interface KnowledgeChunk {
  id: string;
  source: string;
  heading: string;
  content: string;
  score: number;
  fileType: 'md' | 'transcript';
}

export interface SearchResult {
  query: string;
  matchedChunks: KnowledgeChunk[];
  totalFilesScanned: number;
}

export interface RetrievalResult {
  chunks: KnowledgeChunk[];
}

export interface ClaudeRequest {
  systemPrompt: string;
  userQuestion: string;
  context: string;
}

export interface ClaudeResponse {
  answer: string;
  rootCause: string;
  recommendedActions: string[];
  references: string[];
}
