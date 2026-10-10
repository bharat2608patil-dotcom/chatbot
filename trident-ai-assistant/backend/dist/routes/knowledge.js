"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const knowledgeDirectory = node_path_1.default.resolve(__dirname, '../../../knowledge');
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (_request, file, callback) => {
        if (node_path_1.default.extname(file.originalname).toLowerCase() !== '.md') {
            callback(new Error('Only Markdown (.md) files are supported right now.'));
            return;
        }
        callback(null, true);
    },
});
const parseUpload = (request, response, next) => {
    upload.single('file')(request, response, (error) => {
        if (!error) {
            next();
            return;
        }
        const isTooLarge = error instanceof multer_1.default.MulterError && error.code === 'LIMIT_FILE_SIZE';
        const message = error instanceof Error ? error.message : 'Unable to process uploaded file.';
        response.status(isTooLarge ? 413 : 400).json({ ok: false, message });
    });
};
router.post('/api/knowledge/upload', parseUpload, async (request, response) => {
    const file = request.file;
    if (!file) {
        response.status(400).json({ ok: false, message: 'Choose a Markdown file to upload.' });
        return;
    }
    let markdown;
    try {
        markdown = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    }
    catch {
        response.status(400).json({ ok: false, message: 'The Markdown file must use UTF-8 encoding.' });
        return;
    }
    if (!markdown.trim() || markdown.includes('\0')) {
        response.status(400).json({ ok: false, message: 'The Markdown file must contain readable text.' });
        return;
    }
    const originalName = node_path_1.default.basename(file.originalname.replace(/\\/g, '/'));
    const baseName = originalName
        .replace(/\.md$/i, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
    if (!baseName) {
        response.status(400).json({ ok: false, message: 'The uploaded file must have a valid filename.' });
        return;
    }
    const fileName = `${baseName}.md`;
    const destination = node_path_1.default.join(knowledgeDirectory, fileName);
    try {
        await node_fs_1.promises.mkdir(knowledgeDirectory, { recursive: true });
        await node_fs_1.promises.writeFile(destination, file.buffer, { flag: 'wx' });
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
            response.status(409).json({
                ok: false,
                message: `A knowledge file named ${fileName} already exists. Rename the upload and try again.`,
            });
            return;
        }
        console.error('[knowledge] failed to save uploaded Markdown file:', error);
        response.status(500).json({ ok: false, message: 'The knowledge file could not be saved.' });
        return;
    }
    console.log(`[knowledge] uploaded ${fileName} (${file.size} bytes)`);
    response.status(201).json({
        ok: true,
        message: 'Knowledge file uploaded successfully.',
        fileName,
        sizeBytes: file.size,
    });
});
exports.default = router;
//# sourceMappingURL=knowledge.js.map