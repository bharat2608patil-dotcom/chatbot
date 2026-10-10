import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ChatMessage } from '../types';

const STORAGE_DIR = path.resolve(__dirname, '../../../storage');
const QUERIES_FILE = path.join(STORAGE_DIR, 'queries.json');
const HISTORY_FILE = path.join(STORAGE_DIR, 'chat-history.json');

async function ensureFile(filePath: string, fallback: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, fallback, 'utf8');
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) {
      return fallback;
    }
    return JSON.parse(content) as T;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8');
    return fallback;
  }
}

export async function appendQuery(question: string): Promise<void> {
  await ensureFile(QUERIES_FILE, '[]');
  const queries = await readJson<Array<{ question: string; timestamp: string }>>(QUERIES_FILE, []);
  queries.push({
    question,
    timestamp: new Date().toISOString(),
  });
  await fs.writeFile(QUERIES_FILE, JSON.stringify(queries, null, 2), 'utf8');
}

export async function appendChatMessage(message: ChatMessage): Promise<void> {
  await ensureFile(HISTORY_FILE, '[]');
  const history = await readJson<ChatMessage[]>(HISTORY_FILE, []);
  history.push(message);
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

export async function getChatHistory(limit = 100): Promise<ChatMessage[]> {
  await ensureFile(HISTORY_FILE, '[]');
  const history = await readJson<ChatMessage[]>(HISTORY_FILE, []);
  return history.slice(-limit);
}
