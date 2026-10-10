import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { appendChatMessage, appendQuery } from '../storage/storage';
import { retrieveRelevantChunks } from '../retrieval/retrievalService';
import { callClaude } from '../services/claudeService';
import type { ChatRequest, ChatResponse } from '../types';

const router = Router();

router.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'trident-ai-assistant',
    timestamp: new Date().toISOString(),
  });
});

router.post('/api/chat', async (req, res) => {
  try {
    const requestStartedAt = Date.now();
    const { question } = req.body as ChatRequest;

    console.log('[chat] request received');
    console.log(`[chat] incoming question: ${question ?? ''}`);

    if (!question || !question.trim()) {
      console.warn('[chat] request rejected: empty question');
      res.status(400).json({
        ok: false,
        message: 'Question is required.',
      });
      return;
    }

    const cleanQuestion = question.trim();
    console.log(`[chat] cleaned question: ${cleanQuestion}`);
    console.log('[chat] saving query to storage');
    await appendQuery(cleanQuestion);
    console.log('[chat] query saved to queries.json');

    console.log('[chat] starting retrieval engine');
    const retrieved = await retrieveRelevantChunks(cleanQuestion, 5);
    console.log(`[chat] retrieval complete. chunks found: ${retrieved.chunks.length}`);
    if (retrieved.chunks.length === 0) {
      console.warn('[chat] no relevant knowledge chunks found');
    }
    console.log('[chat] selected knowledge chunks for Claude:');
    retrieved.chunks.forEach((chunk, index) => {
      console.log(`[chat] chunk ${index + 1}: source=${chunk.source}, score=${chunk.score}`);
      console.log(`[chat] chunk ${index + 1} heading: ${chunk.heading}`);
      console.log(`[chat] chunk ${index + 1} content:\n${chunk.content}`);
    });

    const contextBlocks = retrieved.chunks.map((chunk) => {
      return [
        `Source: ${chunk.source}`,
        `Heading: ${chunk.heading}`,
        `Content: ${chunk.content}`,
      ].join('\n');
    });

    const context = contextBlocks.length > 0 ? contextBlocks.join('\n\n') : 'No relevant source material was found in the local knowledge base.';
    console.log(`[chat] context built. length=${context.length}`);
    console.log('[chat] exact question and knowledge context passed to Claude:');
    console.log(`[chat] question: ${cleanQuestion}`);
    console.log(`[chat] context:\n${context}`);

    console.log('[chat] calling Claude CLI with retrieved context');
    const claudeResult = await callClaude({
      systemPrompt: 'You are Trident AI Assistant.',
      userQuestion: cleanQuestion,
      context,
    });
    console.log('[chat] Claude response received');
    console.log(`[chat] Claude answer: ${claudeResult.answer.slice(0, 220)}`);

    const timestamp = new Date().toISOString();
    const references = claudeResult.references.length > 0 ? claudeResult.references : retrieved.chunks.map((chunk) => chunk.source);

    const response: ChatResponse = {
      answer: claudeResult.answer,
      rootCause: claudeResult.rootCause,
      recommendedActions: claudeResult.recommendedActions,
      references,
      timestamp,
    };

    console.log('[chat] saving chat history');
    await appendChatMessage({
      id: randomUUID(),
      role: 'user',
      content: cleanQuestion,
      timestamp,
      references,
    });

    await appendChatMessage({
      id: randomUUID(),
      role: 'assistant',
      content: claudeResult.answer,
      timestamp,
      references,
    });
    console.log(`[chat] response sent in ${(Date.now() - requestStartedAt)}ms`);

    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[chat] request failed:', error);
    res.status(500).json({
      ok: false,
      message,
    });
  }
});

export default router;
