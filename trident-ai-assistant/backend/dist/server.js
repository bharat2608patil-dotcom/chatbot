"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const chat_1 = __importDefault(require("./routes/chat"));
const knowledge_1 = __importDefault(require("./routes/knowledge"));
const app = (0, express_1.default)();
const port = Number(process.env.PORT || 4000);
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
app.use(chat_1.default);
app.use(knowledge_1.default);
app.listen(port, () => {
    console.log(`Trident AI Assistant backend listening on http://localhost:${port}`);
});
//# sourceMappingURL=server.js.map