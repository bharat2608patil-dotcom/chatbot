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
        const { question } = req.body;
        if (!question || !question.trim()) {
            res.status(400).json({
                ok: false,
                message: 'Question is required.',
            });
            return;
        }
        const cleanQuestion = question.trim();
        await (0, storage_1.appendQuery)(cleanQuestion);
        const retrieved = await (0, retrievalService_1.retrieveRelevantChunks)(cleanQuestion, 5);
        const contextBlocks = retrieved.chunks.map((chunk) => {
            return [
                `Source: ${chunk.source}`,
                `Heading: ${chunk.heading}`,
                `Content: ${chunk.content}`,
            ].join('\n');
        });
        const context = contextBlocks.length > 0 ? contextBlocks.join('\n\n') : 'No relevant source material was found in the local knowledge base.';
        const claudeResult = await (0, claudeService_1.callClaude)({
            systemPrompt: 'You are Trident AI Assistant.',
            userQuestion: cleanQuestion,
            context,
        });
        const timestamp = new Date().toISOString();
        const references = claudeResult.references.length > 0 ? claudeResult.references : retrieved.chunks.map((chunk) => chunk.source);
        const response = {
            answer: claudeResult.answer,
            rootCause: claudeResult.rootCause,
            recommendedActions: claudeResult.recommendedActions,
            references,
            timestamp,
        };
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
        res.json(response);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({
            ok: false,
            message,
        });
    }
});
exports.default = router;
//# sourceMappingURL=chat.js.map