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
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension !== '.md' && extension !== '.txt') {
      callback(new Error('Only Markdown (.md) and plain-text transcript (.txt) files are supported.'));
      return;
    }
    callback(null, true);
  },
});

async function collectKnowledgeFiles(directory: string): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const files: Array<{ absolutePath: string; relativePath: string }> = [];

  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectKnowledgeFiles(entryPath));
    } else if (entry.isFile() && ['.md', '.txt'].includes(path.extname(entry.name).toLowerCase())) {
      files.push({
        absolutePath: entryPath,
        relativePath: path.relative(knowledgeDirectory, entryPath).replace(/\\/g, '/'),
      });
    }
  }

  return files;
}

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

router.get('/api/knowledge', async (_request, response) => {
  try {
    await fs.mkdir(knowledgeDirectory, { recursive: true });
    const files = await collectKnowledgeFiles(knowledgeDirectory);
    const details = await Promise.all(files.map(async (file) => {
      const stat = await fs.stat(file.absolutePath);
      return {
        relativePath: file.relativePath,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    }));
    details.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    response.json({ files: details });
  } catch (error) {
    console.error('[knowledge] failed to list Markdown files:', error);
    response.status(500).json({ ok: false, message: 'Knowledge files could not be listed.' });
  }
});

router.delete('/api/knowledge', async (request, response) => {
  const requestedPath = typeof request.query.path === 'string' ? request.query.path : '';
  if (!requestedPath || !['.md', '.txt'].includes(path.extname(requestedPath).toLowerCase())) {
    response.status(400).json({ ok: false, message: 'Provide a Markdown or transcript text file path to delete.' });
    return;
  }

  const destination = path.resolve(knowledgeDirectory, requestedPath);
  const relativePath = path.relative(knowledgeDirectory, destination);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    response.status(400).json({ ok: false, message: 'The requested path is outside the knowledge base.' });
    return;
  }

  try {
    const knowledgeRoot = await fs.realpath(knowledgeDirectory);
    const actualPath = await fs.realpath(destination);
    const actualRelativePath = path.relative(knowledgeRoot, actualPath);
    if (!actualRelativePath || actualRelativePath === '..' || actualRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(actualRelativePath)) {
      response.status(400).json({ ok: false, message: 'The requested path is outside the knowledge base.' });
      return;
    }

    const stat = await fs.stat(actualPath);
    if (!stat.isFile() || !['.md', '.txt'].includes(path.extname(actualPath).toLowerCase())) {
      response.status(400).json({ ok: false, message: 'Only Markdown and transcript text files can be deleted.' });
      return;
    }

    await fs.unlink(actualPath);
    console.log(`[knowledge] deleted ${relativePath}`);
    response.json({ ok: true, relativePath });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      response.status(404).json({ ok: false, message: 'The knowledge file was not found.' });
      return;
    }

    console.error('[knowledge] failed to delete Markdown file:', error);
    response.status(500).json({ ok: false, message: 'The knowledge file could not be deleted.' });
  }
});

router.post('/api/knowledge/upload', parseUpload, async (request, response) => {
  const file = request.file;
  if (!file) {
    response.status(400).json({ ok: false, message: 'Choose a Markdown or plain-text transcript file to upload.' });
    return;
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
  } catch {
    response.status(400).json({ ok: false, message: 'The knowledge file must use UTF-8 encoding.' });
    return;
  }

  if (!text.trim() || text.includes('\0')) {
    response.status(400).json({ ok: false, message: 'The knowledge file must contain readable text.' });
    return;
  }

  const originalName = path.basename(file.originalname.replace(/\\/g, '/'));
  const extension = path.extname(originalName).toLowerCase();
  const baseName = originalName
    .slice(0, -extension.length)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

  if (!baseName) {
    response.status(400).json({ ok: false, message: 'The uploaded file must have a valid filename.' });
    return;
  }

  const fileName = `${baseName}${extension}`;
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

    console.error('[knowledge] failed to save uploaded knowledge file:', error);
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