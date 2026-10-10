import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';

const router = Router();
const knowledgeDirectory = path.resolve(__dirname, '../../../knowledge');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_request, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.md') {
      callback(new Error('Only Markdown (.md) files are supported right now.'));
      return;
    }
    callback(null, true);
  },
});

const parseUpload: RequestHandler = (request, response, next) => {
  upload.single('file')(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    const isTooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
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

  let markdown: string;
  try {
    markdown = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
  } catch {
    response.status(400).json({ ok: false, message: 'The Markdown file must use UTF-8 encoding.' });
    return;
  }

  if (!markdown.trim() || markdown.includes('\0')) {
    response.status(400).json({ ok: false, message: 'The Markdown file must contain readable text.' });
    return;
  }

  const originalName = path.basename(file.originalname.replace(/\\/g, '/'));
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
  const destination = path.join(knowledgeDirectory, fileName);

  try {
    await fs.mkdir(knowledgeDirectory, { recursive: true });
    await fs.writeFile(destination, file.buffer, { flag: 'wx' });
  } catch (error) {
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

export default router;