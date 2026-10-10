import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeChunk, RetrievalResult } from '../types';

const KNOWLEDGE_ROOT = path.resolve(__dirname, '../../../knowledge');
const STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'are', 'can', 'could', 'does', 'during', 'for', 'from',
  'how', 'into', 'its', 'our', 'should', 'that', 'the', 'their', 'then', 'there', 'these',
  'they', 'this', 'through', 'what', 'when', 'where', 'which', 'while', 'with', 'would',
  'you', 'your',
]);
const DEFAULT_CHUNK_LIMIT = 5;
const MAX_CHUNK_LIMIT = 8;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
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

function getChunkLimit(question: string): number {
  const terms = tokenize(question);
  const normalizedQuestion = normalize(question);
  const broadQuestion = /\b(all|across|compare|overview|summari[sz]e|comprehensive|every|entire)\b/i.test(normalizedQuestion);

  if (broadQuestion || terms.length >= 10) {
    return MAX_CHUNK_LIMIT;
  }
  if (terms.length <= 3) {
    return 3;
  }
  return DEFAULT_CHUNK_LIMIT;
}

interface CandidateChunk extends KnowledgeChunk {
  terms: string[];
}

function rankChunks(chunks: CandidateChunk[], queryTerms: string[], question: string): CandidateChunk[] {
  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of new Set(chunk.terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const averageLength = chunks.reduce((total, chunk) => total + chunk.terms.length, 0) / Math.max(chunks.length, 1);
  const normalizedQuestion = normalize(question);
  const ranked = chunks.map((chunk) => {
    const frequencies = new Map<string, number>();
    for (const term of chunk.terms) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }

    const headingTerms = new Set(tokenize(chunk.heading));
    const sourceTerms = new Set(tokenize(path.basename(chunk.source, '.md')));
    let score = 0;
    let matchedTerms = 0;

    for (const term of queryTerms) {
      const frequency = frequencies.get(term) ?? 0;
      if (frequency === 0) {
        continue;
      }

      matchedTerms += 1;
      const inverseFrequency = Math.log(1 + (chunks.length - (documentFrequency.get(term) ?? 0) + 0.5) / ((documentFrequency.get(term) ?? 0) + 0.5));
      const lengthRatio = chunk.terms.length / Math.max(averageLength, 1);
      score += inverseFrequency * ((frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * lengthRatio)));
      if (headingTerms.has(term)) score += inverseFrequency * 1.5;
      if (sourceTerms.has(term)) score += inverseFrequency * 1.25;
    }

    if (matchedTerms > 1 && normalizedQuestion && normalize(chunk.content).includes(normalizedQuestion)) {
      score += 2;
    }

    return { ...chunk, score: score + matchedTerms * 0.25 };
  });

  return ranked.filter((chunk) => chunk.score > 0).sort((left, right) => right.score - left.score);
}

function selectDiverseChunks(chunks: CandidateChunk[], topN: number): KnowledgeChunk[] {
  const selected: CandidateChunk[] = [];
  const deferred: CandidateChunk[] = [];
  const seenContent = new Set<string>();
  const sourceCounts = new Map<string, number>();

  for (const chunk of chunks) {
    const contentKey = normalize(chunk.content);
    if (seenContent.has(contentKey)) {
      continue;
    }
    seenContent.add(contentKey);

    if ((sourceCounts.get(chunk.source) ?? 0) >= 2) {
      deferred.push(chunk);
      continue;
    }

    selected.push(chunk);
    sourceCounts.set(chunk.source, (sourceCounts.get(chunk.source) ?? 0) + 1);
    if (selected.length === topN) {
      break;
    }
  }

  if (selected.length < topN) {
    for (const chunk of deferred) {
      selected.push(chunk);
      if (selected.length === topN) break;
    }
  }

  return selected.map(({ terms: _terms, ...chunk }) => chunk);
}

export async function retrieveRelevantChunks(question: string, topN = getChunkLimit(question)): Promise<RetrievalResult> {
  const queryTerms = [...new Set(tokenize(question))];
  console.log('[retrieval] query terms:', queryTerms);

  if (queryTerms.length === 0) {
    console.warn('[retrieval] no searchable keywords after normalization');
    return { chunks: [] };
  }

  const files = collectMarkdownFiles(KNOWLEDGE_ROOT);
  console.log(`[retrieval] scanning ${files.length} markdown files`);
  const candidates: CandidateChunk[] = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const blocks = content
        .split(/\n\s*\n+/)
        .map((block) => block.trim())
        .filter(Boolean);
      let currentHeading = path.basename(filePath, '.md');
      let chunkIndex = 0;

      for (const block of blocks) {
        const headings = [...block.matchAll(/^\s*#{1,6}\s+(.+)$/gm)];
        if (headings.length > 0) {
          currentHeading = (headings[headings.length - 1][1] ?? '').trim();
        }
        const paragraph = block.replace(/^\s*#{1,6}\s+.+$/gm, '').trim();
        if (paragraph.length <= 80) continue;

        candidates.push({
          id: `${getRelativeFromRoot(filePath)}-${++chunkIndex}`,
          source: getRelativeFromRoot(filePath),
          heading: currentHeading,
          content: paragraph,
          score: 0,
          fileType: 'md',
          terms: tokenize(`${currentHeading} ${path.basename(filePath, '.md')} ${paragraph}`),
        });
      }
    } catch (error) {
      console.error(`[retrieval] failed to read ${filePath}`, error);
    }
  }

  const rankedChunks = rankChunks(candidates, queryTerms, question);
  console.log(`[retrieval] matched chunks before ranking: ${rankedChunks.length}`);
  console.log(`[retrieval] adaptive chunk limit: ${topN}`);
  const selectedChunks = selectDiverseChunks(rankedChunks, topN);
  console.log(`[retrieval] selected top ${selectedChunks.length} chunks`);

  return {
    chunks: selectedChunks,
  };
}
