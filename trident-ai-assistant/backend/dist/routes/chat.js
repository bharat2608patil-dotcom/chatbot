"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_crypto_1 = require("node:crypto");
const storage_1 = require("../storage/storage");
const retrievalService_1 = require("../retrieval/retrievalService");
const claudeService_1 = require("../services/claudeService");
const router = (0, express_1.Router)();
router.get('/api/chat/history', async (req, res) => {
    const requestedLimit = Number(req.query.limit ?? 100);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
        res.status(400).json({ ok: false, message: 'History limit must be a positive integer.' });
        return;
    }
    try {
        const messages = await (0, storage_1.getChatHistory)(requestedLimit);
        res.json({ messages });
    }
    catch (error) {
        console.error('[chat] failed to load chat history:', error);
        res.status(500).json({ ok: false, message: 'Chat history could not be loaded.' });
    }
});
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
        const retrieved = await (0, retrievalService_1.retrieveRelevantChunks)(cleanQuestion);
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
        const references = [...new Set(retrieved.chunks.map((chunk) => `${chunk.source} — ${chunk.heading}`))];
        if (retrieved.chunks.length === 0) {
            const answer = [
                'Answer',
                'I could not find relevant information in the available knowledge sources to answer this question.',
                '',
                'Possible Root Cause',
                'A root cause cannot be established because no relevant source passages were found.',
                '',
                'Recommended Actions',
                '1. Try rephrasing the question using terms from the knowledge base.',
                '2. Add or upload a relevant .md or .txt knowledge file, then ask again.',
                '',
                'Reference Sources',
            ].join('\n');
            const timestamp = new Date().toISOString();
            const response = {
                answer,
                rootCause: 'A root cause cannot be established because no relevant source passages were found.',
                recommendedActions: [
                    'Try rephrasing the question using terms from the knowledge base.',
                    'Add or upload a relevant .md or .txt knowledge file, then ask again.',
                ],
                references: [],
                timestamp,
            };
            await (0, storage_1.appendChatMessage)({
                id: (0, node_crypto_1.randomUUID)(),
                role: 'user',
                content: cleanQuestion,
                timestamp,
                references: [],
            });
            await (0, storage_1.appendChatMessage)({
                id: (0, node_crypto_1.randomUUID)(),
                role: 'assistant',
                content: answer,
                timestamp,
                references: [],
            });
            res.json(response);
            return;
        }
        console.log(`[chat] context built. length=${context.length}`);
        console.log('[chat] exact question and knowledge context passed to Claude:');
        console.log(`[chat] question: ${cleanQuestion}`);
        console.log(`[chat] context:\n${context}`);
        console.log('[chat] calling Claude CLI with retrieved context');
        let claudeResult;
        try {
            claudeResult = await (0, claudeService_1.callClaude)({
                systemPrompt: 'You are Trident AI Assistant.',
                userQuestion: cleanQuestion,
                context,
                references,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Claude Code CLI failed unexpectedly.';
            console.error('[chat] answer generation failed:', error);
            res.status(503).json({
                ok: false,
                message: `${message} No generated answer was saved to chat history.`,
            });
            return;
        }
        console.log('[chat] Claude response received');
        console.log(`[chat] Claude answer: ${claudeResult.answer.slice(0, 220)}`);
        const timestamp = new Date().toISOString();
        const responseReferences = references.length > 0 ? references : claudeResult.references;
        const response = {
            answer: claudeResult.answer,
            rootCause: claudeResult.rootCause,
            recommendedActions: claudeResult.recommendedActions,
            references: responseReferences,
            timestamp,
        };
        console.log('[chat] saving chat history');
        await (0, storage_1.appendChatMessage)({
            id: (0, node_crypto_1.randomUUID)(),
            role: 'user',
            content: cleanQuestion,
            timestamp,
            references: responseReferences,
        });
        await (0, storage_1.appendChatMessage)({
            id: (0, node_crypto_1.randomUUID)(),
            role: 'assistant',
            content: claudeResult.answer,
            timestamp,
            references: responseReferences,
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