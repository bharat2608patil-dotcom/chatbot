import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from 'express';

const CREDENTIALS_FILE = path.resolve(__dirname, '../../../storage/auth.json');
const SESSION_COOKIE = 'knowledge_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const PASSWORD_HASH_BYTES = 64;
const KNOWLEDGE_SETUP_CODE = randomBytes(24).toString('hex');

interface StoredCredentials {
  username: string;
  salt: string;
  passwordHash: string;
}

interface Session {
  expiresAt: number;
  csrfToken: string;
}

const sessions = new Map<string, Session>();

export function getKnowledgeSetupCode(): string {
  return KNOWLEDGE_SETUP_CODE;
}

function derivePasswordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_HASH_BYTES, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function isStoredCredentials(value: unknown): value is StoredCredentials {
  if (!value || typeof value !== 'object') return false;
  const credentials = value as Partial<StoredCredentials>;
  return typeof credentials.username === 'string'
    && typeof credentials.salt === 'string'
    && typeof credentials.passwordHash === 'string';
}

async function readCredentials(): Promise<StoredCredentials | null> {
  let content: string;
  try {
    content = await fs.readFile(CREDENTIALS_FILE, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Knowledge authentication file is invalid JSON.');
  }

  if (!isStoredCredentials(parsed)) {
    throw new Error('Knowledge authentication file has an invalid format.');
  }
  return parsed;
}

export async function isKnowledgeAuthConfigured(): Promise<boolean> {
  return (await readCredentials()) !== null;
}

export async function createKnowledgeAdmin(username: string, password: string, setupCode: string): Promise<void> {
  const expectedCode = Buffer.from(KNOWLEDGE_SETUP_CODE, 'hex');
  const providedCode = /^[a-f0-9]{48}$/i.test(setupCode) ? Buffer.from(setupCode, 'hex') : Buffer.alloc(0);
  if (providedCode.length !== expectedCode.length || !timingSafeEqual(expectedCode, providedCode)) {
    throw new Error('The first-run setup code is invalid. Check the backend terminal and try again.');
  }

  await fs.mkdir(path.dirname(CREDENTIALS_FILE), { recursive: true });
  const salt = randomBytes(16).toString('hex');
  const passwordHash = (await derivePasswordHash(password, salt)).toString('hex');
  const credentials: StoredCredentials = { username, salt, passwordHash };

  try {
    await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      throw new Error('Knowledge administrator setup has already been completed.');
    }
    throw error;
  }
}

export async function verifyKnowledgeAdmin(username: string, password: string): Promise<boolean> {
  const credentials = await readCredentials();
  if (!credentials || credentials.username !== username) return false;

  const expectedHash = Buffer.from(credentials.passwordHash, 'hex');
  const actualHash = await derivePasswordHash(password, credentials.salt);
  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
}

export function createKnowledgeSession(): { token: string; csrfToken: string } {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }

  const token = randomBytes(32).toString('hex');
  const csrfToken = randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: now + SESSION_DURATION_MS, csrfToken });
  return { token, csrfToken };
}

function readSessionToken(cookieHeader: string | undefined): string | null {
  const cookie = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function isKnowledgeSessionActive(cookieHeader: string | undefined): boolean {
  const token = readSessionToken(cookieHeader);
  if (!token) return false;

  const session = sessions.get(token);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function getKnowledgeCsrfToken(cookieHeader: string | undefined): string | null {
  const token = readSessionToken(cookieHeader);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) return null;
  return session.csrfToken;
}

export function revokeKnowledgeSession(cookieHeader: string | undefined): void {
  const token = readSessionToken(cookieHeader);
  if (token) sessions.delete(token);
}

export function setKnowledgeSessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}${secure ? '; Secure' : ''}`;
}

export function clearKnowledgeSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

export const requireKnowledgeAuth: RequestHandler = (request, response, next) => {
  if (!isKnowledgeSessionActive(request.headers.cookie)) {
    response.status(401).json({ ok: false, message: 'Knowledge management login required.' });
    return;
  }
  if (request.method !== 'GET') {
    const expectedToken = getKnowledgeCsrfToken(request.headers.cookie);
    const providedToken = request.headers['x-csrf-token'];
    if (!expectedToken || typeof providedToken !== 'string') {
      response.status(403).json({ ok: false, message: 'Knowledge management request could not be verified. Log in again.' });
      return;
    }
    const expectedBuffer = Buffer.from(expectedToken);
    const providedBuffer = Buffer.from(providedToken);
    if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
      response.status(403).json({ ok: false, message: 'Knowledge management request could not be verified. Log in again.' });
      return;
    }
  }
  next();
};
