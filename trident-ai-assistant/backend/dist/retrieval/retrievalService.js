"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveRelevantChunks = retrieveRelevantChunks;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const KNOWLEDGE_ROOT = node_path_1.default.resolve(__dirname, '../../../knowledge');
function normalize(value) {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function getRelativeFromRoot(filePath) {
    return node_path_1.default.relative(KNOWLEDGE_ROOT, filePath).replace(/\\/g, '/');
}
function collectMarkdownFiles(directory) {
    const results = [];
    for (const entry of node_fs_1.default.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = node_path_1.default.join(directory, entry.name);
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
function scoreParagraph(content, queryTerms) {
    const normalized = normalize(content);
    if (!normalized) {
        return 0;
    }
    let score = 0;
    for (const term of queryTerms) {
        if (!term)
            continue;
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = normalized.match(regex);
        score += matches ? matches.length * 4 : 0;
    }
    if (normalized.includes('namespace'))
        score += 10;
    if (normalized.includes('migration'))
        score += 8;
    if (normalized.includes('incident'))
        score += 8;
    if (normalized.includes('access'))
        score += 6;
    if (normalized.includes('approval'))
        score += 6;
    return score;
}
function buildHeading(filePath, content) {
    const firstLine = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith('#'));
    const fileName = node_path_1.default.basename(filePath, '.md');
    const cleaned = (firstLine ?? fileName).replace(/\s+/g, ' ').trim();
    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}
async function retrieveRelevantChunks(question, topN = 5) {
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
    const matches = [];
    for (const filePath of files) {
        try {
            const content = node_fs_1.default.readFileSync(filePath, 'utf8');
            const blocks = content
                .split(/\n\s*\n+/)
                .map((block) => block.trim())
                .filter((block) => block.length > 80);
            for (const block of blocks) {
                const score = scoreParagraph(block, queryTerms);
                if (score <= 0)
                    continue;
                matches.push({
                    id: `${node_path_1.default.basename(filePath, '.md')}-${matches.length + 1}`,
                    source: getRelativeFromRoot(filePath),
                    heading: buildHeading(filePath, block),
                    content: block,
                    score,
                    fileType: 'md',
                });
            }
        }
        catch (error) {
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
//# sourceMappingURL=retrievalService.js.map