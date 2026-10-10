import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeChunk, RetrievalResult } from '../types';

const KNOWLEDGE_ROOT = path.resolve(__dirname, '../../../knowledge');

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getRelativeFromRoot(filePath: string): string {
  return path.relative(KNOWLEDGE_ROOT, filePath).replace(/\\/g, '/');
}

function collectMarkdownFiles(directory: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push(entryPath);
    }
  }

  return results;
}

function scoreParagraph(content: string, queryTerms: string[]): number {
  const normalized = normalize(content);
  if (!normalized) {
    return 0;
  }

  let score = 0;
  for (const term of queryTerms) {
    if (!term) continue;
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = normalized.match(regex);
    score += matches ? matches.length * 4 : 0;
  }

  if (normalized.includes('namespace')) score += 10;
  if (normalized.includes('migration')) score += 8;
  if (normalized.includes('incident')) score += 8;
  if (normalized.includes('access')) score += 6;
  if (normalized.includes('approval')) score += 6;

  return score;
}

function buildHeading(filePath: string, content: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));

  const fileName = path.basename(filePath, '.md');
  const cleaned = (firstLine ?? fileName).replace(/\s+/g, ' ').trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

export async function retrieveRelevantChunks(question: string, topN = 5): Promise<RetrievalResult> {
  const queryTerms = normalize(question)
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .slice(0, 12);

  console.log('[retrieval] query terms:', queryTerms);

  if (queryTerms.length === 0) {
    console.warn('[retrieval] no searchable keywords after normalization');
    return { chunks: [] };
  }

  const files = collectMarkdownFiles(KNOWLEDGE_ROOT);
  console.log(`[retrieval] scanning ${files.length} markdown files`);
  const matches: KnowledgeChunk[] = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const blocks = content
        .split(/\n\s*\n+/)
        .map((block) => block.trim())
        .filter((block) => block.length > 80);

      for (const block of blocks) {
        const score = scoreParagraph(block, queryTerms);
        if (score <= 0) continue;

        matches.push({
          id: `${path.basename(filePath, '.md')}-${matches.length + 1}`,
          source: getRelativeFromRoot(filePath),
          heading: buildHeading(filePath, block),
          content: block,
          score,
          fileType: 'md',
        });
      }
    } catch (error) {
      console.error(`[retrieval] failed to read ${filePath}`, error);
    }
  }

  matches.sort((a, b) => b.score - a.score);
  console.log(`[retrieval] matched chunks before ranking: ${matches.length}`);
  const selectedChunks = matches.slice(0, topN);
  console.log(`[retrieval] selected top ${selectedChunks.length} chunks`);

  return {
    chunks: selectedChunks,
  };
}
