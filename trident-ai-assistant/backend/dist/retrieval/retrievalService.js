"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveRelevantChunks = retrieveRelevantChunks;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const KNOWLEDGE_ROOT = node_path_1.default.resolve(__dirname, '../../../knowledge');
const STOP_WORDS = new Set([
    'about', 'after', 'also', 'and', 'are', 'can', 'could', 'does', 'during', 'for', 'from',
    'how', 'into', 'its', 'our', 'should', 'that', 'the', 'their', 'then', 'there', 'these',
    'they', 'this', 'through', 'what', 'when', 'where', 'which', 'while', 'with', 'would',
    'you', 'your',
]);
const DEFAULT_CHUNK_LIMIT = 5;
const MAX_CHUNK_LIMIT = 8;
function normalize(value) {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokenize(value) {
    return normalize(value)
        .split(/\s+/)
        .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}
function getRelativeFromRoot(filePath) {
    return node_path_1.default.relative(KNOWLEDGE_ROOT, filePath).replace(/\\/g, '/');
}
function collectKnowledgeFiles(directory) {
    const results = [];
    for (const entry of node_fs_1.default.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = node_path_1.default.join(directory, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectKnowledgeFiles(entryPath));
            continue;
        }
        if (entry.isFile() && ['.md', '.txt'].includes(node_path_1.default.extname(entry.name).toLowerCase())) {
            results.push(entryPath);
        }
    }
    return results;
}
function getChunkLimit(question) {
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
function rankChunks(chunks, queryTerms, question) {
    const documentFrequency = new Map();
    for (const chunk of chunks) {
        for (const term of new Set(chunk.terms)) {
            documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
        }
    }
    const averageLength = chunks.reduce((total, chunk) => total + chunk.terms.length, 0) / Math.max(chunks.length, 1);
    const normalizedQuestion = normalize(question);
    const ranked = chunks.map((chunk) => {
        const frequencies = new Map();
        for (const term of chunk.terms) {
            frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
        }
        const headingTerms = new Set(tokenize(chunk.heading));
        const sourceTerms = new Set(tokenize(node_path_1.default.parse(chunk.source).name));
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
            if (headingTerms.has(term))
                score += inverseFrequency * 1.5;
            if (sourceTerms.has(term))
                score += inverseFrequency * 1.25;
        }
        if (matchedTerms > 1 && normalizedQuestion && normalize(chunk.content).includes(normalizedQuestion)) {
            score += 2;
        }
        return { ...chunk, score: score + matchedTerms * 0.25 };
    });
    return ranked.filter((chunk) => chunk.score > 0).sort((left, right) => right.score - left.score);
}
function selectDiverseChunks(chunks, topN) {
    const selected = [];
    const deferred = [];
    const seenContent = new Set();
    const sourceCounts = new Map();
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
            if (selected.length === topN)
                break;
        }
    }
    return selected.map(({ terms: _terms, ...chunk }) => chunk);
}
async function retrieveRelevantChunks(question, topN = getChunkLimit(question)) {
    const queryTerms = [...new Set(tokenize(question))];
    console.log('[retrieval] query terms:', queryTerms);
    if (queryTerms.length === 0) {
        console.warn('[retrieval] no searchable keywords after normalization');
        return { chunks: [] };
    }
    const files = collectKnowledgeFiles(KNOWLEDGE_ROOT);
    console.log(`[retrieval] scanning ${files.length} knowledge files`);
    const candidates = [];
    for (const filePath of files) {
        try {
            const content = node_fs_1.default.readFileSync(filePath, 'utf8');
            const extension = node_path_1.default.extname(filePath).toLowerCase();
            const fileType = extension === '.txt' ? 'transcript' : 'md';
            const blocks = content
                .split(/\n\s*\n+/)
                .map((block) => block.trim())
                .filter(Boolean);
            let currentHeading = node_path_1.default.parse(filePath).name;
            let chunkIndex = 0;
            for (const block of blocks) {
                const headings = [...block.matchAll(/^\s*#{1,6}\s+(.+)$/gm)];
                if (headings.length > 0) {
                    currentHeading = (headings[headings.length - 1][1] ?? '').trim();
                }
                const paragraph = block.replace(/^\s*#{1,6}\s+.+$/gm, '').trim();
                if (paragraph.length <= 80)
                    continue;
                candidates.push({
                    id: `${getRelativeFromRoot(filePath)}-${++chunkIndex}`,
                    source: getRelativeFromRoot(filePath),
                    heading: currentHeading,
                    content: paragraph,
                    score: 0,
                    fileType,
                    terms: tokenize(`${currentHeading} ${node_path_1.default.parse(filePath).name} ${paragraph}`),
                });
            }
        }
        catch (error) {
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
//# sourceMappingURL=retrievalService.js.map