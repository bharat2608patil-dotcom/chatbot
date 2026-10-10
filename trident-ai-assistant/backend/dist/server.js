"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const auth_1 = __importDefault(require("./routes/auth"));
const chat_1 = __importDefault(require("./routes/chat"));
const knowledge_1 = __importDefault(require("./routes/knowledge"));
const knowledgeAuth_1 = require("./services/knowledgeAuth");
const app = (0, express_1.default)();
const port = Number(process.env.PORT || 4000);
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
app.use(auth_1.default);
app.use(chat_1.default);
app.use(knowledge_1.default);
async function startServer() {
    if (!(await (0, knowledgeAuth_1.isKnowledgeAuthConfigured)())) {
        console.warn('[auth] first-run knowledge administrator setup code (keep private):');
        console.warn((0, knowledgeAuth_1.getKnowledgeSetupCode)());
    }
    app.listen(port, () => {
        console.log(`Trident AI Assistant backend listening on http://localhost:${port}`);
    });
}
void startServer().catch((error) => {
    console.error('[server] failed to start:', error);
    process.exitCode = 1;
});
//# sourceMappingURL=server.js.map