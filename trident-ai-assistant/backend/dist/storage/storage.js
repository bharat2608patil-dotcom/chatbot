"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendQuery = appendQuery;
exports.appendChatMessage = appendChatMessage;
exports.getChatHistory = getChatHistory;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const STORAGE_DIR = node_path_1.default.resolve(__dirname, '../../../storage');
const QUERIES_FILE = node_path_1.default.join(STORAGE_DIR, 'queries.json');
const HISTORY_FILE = node_path_1.default.join(STORAGE_DIR, 'chat-history.json');
async function ensureFile(filePath, fallback) {
    await node_fs_1.promises.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
    try {
        await node_fs_1.promises.access(filePath);
    }
    catch {
        await node_fs_1.promises.writeFile(filePath, fallback, 'utf8');
    }
}
async function readJson(filePath, fallback) {
    try {
        const content = await node_fs_1.promises.readFile(filePath, 'utf8');
        if (!content.trim()) {
            return fallback;
        }
        return JSON.parse(content);
    }
    catch {
        await node_fs_1.promises.mkdir(node_path_1.default.dirname(filePath), { recursive: true });
        await node_fs_1.promises.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8');
        return fallback;
    }
}
async function appendQuery(question) {
    await ensureFile(QUERIES_FILE, '[]');
    const queries = await readJson(QUERIES_FILE, []);
    queries.push({
        question,
        timestamp: new Date().toISOString(),
    });
    await node_fs_1.promises.writeFile(QUERIES_FILE, JSON.stringify(queries, null, 2), 'utf8');
}
async function appendChatMessage(message) {
    await ensureFile(HISTORY_FILE, '[]');
    const history = await readJson(HISTORY_FILE, []);
    history.push(message);
    await node_fs_1.promises.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}
async function getChatHistory(limit = 100) {
    await ensureFile(HISTORY_FILE, '[]');
    const history = await readJson(HISTORY_FILE, []);
    return history.slice(-limit);
}
//# sourceMappingURL=storage.js.map