"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_crypto_1 = require("node:crypto");
const storage_1 = require("../storage/storage");
const retrievalService_1 = require("../retrieval/retrievalService");
const claudeService_1 = require("../services/claudeService");
const router = (0, express_1.Router)();
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
        const { question } = req.body;
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
        await (0, storage_1.appendQuery)(cleanQuestion);
        console.log('[chat] query saved to queries.json');
        console.log('[chat] starting retrieval engine');
        const retrieved = await (0, retrievalService_1.retrieveRelevantChunks)(cleanQuestion, 5);
        console.log(`[chat] retrieval complete. chunks found: ${retrieved.chunks.length}`);
        if (retrieved.chunks.length === 0) {
            console.warn('[chat] no relevant knowledge chunks found');
        }
        const contextBlocks = retrieved.chunks.map((chunk) => {
            return [
                `Source: ${chunk.source}`,
                `Heading: ${chunk.heading}`,
                `Content: ${chunk.content}`,
            ].join('\n');
        });
        const context = contextBlocks.length > 0 ? contextBlocks.join('\n\n') : 'No relevant source material was found in the local knowledge base.';
        console.log(`[chat] context built. length=${context.length}`);
        console.log('[chat] calling Claude CLI with retrieved context');
        const claudeResult = await (0, claudeService_1.callClaude)({
            systemPrompt: 'You are Trident AI Assistant.',
            userQuestion: cleanQuestion,
            context,
        });
        console.log('[chat] Claude response received');
        console.log(`[chat] Claude answer: ${claudeResult.answer.slice(0, 220)}`);
        const timestamp = new Date().toISOString();
        const references = claudeResult.references.length > 0 ? claudeResult.references : retrieved.chunks.map((chunk) => chunk.source);
        const response = {
            answer: claudeResult.answer,
            rootCause: claudeResult.rootCause,
            recommendedActions: claudeResult.recommendedActions,
            references,
            timestamp,
        };
        console.log('[chat] saving chat history');
        await (0, storage_1.appendChatMessage)({
            id: (0, node_crypto_1.randomUUID)(),
            role: 'user',
            content: cleanQuestion,
            timestamp,
            references,
        });
        await (0, storage_1.appendChatMessage)({
            id: (0, node_crypto_1.randomUUID)(),
            role: 'assistant',
            content: claudeResult.answer,
            timestamp,
            references,
        });
        console.log(`[chat] response sent in ${(Date.now() - requestStartedAt)}ms`);
        res.json(response);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[chat] request failed:', error);
        res.status(500).json({
            ok: false,
            message,
        });
    }
});
exports.default = router;
//# sourceMappingURL=chat.js.map