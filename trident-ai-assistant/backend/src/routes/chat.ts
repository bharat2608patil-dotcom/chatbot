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
    const { question } = req.body as ChatRequest;

    if (!question || !question.trim()) {
      res.status(400).json({
        ok: false,
        message: 'Question is required.',
      });
      return;
    }

    const cleanQuestion = question.trim();
    await appendQuery(cleanQuestion);

    const retrieved = await retrieveRelevantChunks(cleanQuestion, 5);
    const contextBlocks = retrieved.chunks.map((chunk) => {
      return [
        `Source: ${chunk.source}`,
        `Heading: ${chunk.heading}`,
        `Content: ${chunk.content}`,
      ].join('\n');
    });

    const context = contextBlocks.length > 0 ? contextBlocks.join('\n\n') : 'No relevant source material was found in the local knowledge base.';

    const claudeResult = await callClaude({
      systemPrompt: 'You are Trident AI Assistant.',
      userQuestion: cleanQuestion,
      context,
    });

    const timestamp = new Date().toISOString();
    const references = claudeResult.references.length > 0 ? claudeResult.references : retrieved.chunks.map((chunk) => chunk.source);

    const response: ChatResponse = {
      answer: claudeResult.answer,
      rootCause: claudeResult.rootCause,
      recommendedActions: claudeResult.recommendedActions,
      references,
      timestamp,
    };

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

    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      ok: false,
      message,
    });
  }
});

export default router;
