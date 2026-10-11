import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Router, type RequestHandler } from 'express';

interface StoredCredentials {
  username: string;
  salt: string;
  passwordHash: string;
}

interface KnowledgeSession {
  username: string;
  expiresAt: number;
}

const router = Router();
const storageDirectory = path.resolve(__dirname, '../../../storage');
const credentialsFile = path.join(storageDirectory, 'knowledge-auth.json');
const sessionCookieName = 'knowledge_session';
const sessionDurationMs = 8 * 60 * 60 * 1000;
const sessions = new Map<string, KnowledgeSession>();

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

async function readCredentials(): Promise<StoredCredentials | null> {
  try {
    const content = await fs.readFile(credentialsFile, 'utf8');
    const credentials = JSON.parse(content) as Partial<StoredCredentials>;
    if (
      typeof credentials.username !== 'string'
      || typeof credentials.salt !== 'string'
      || typeof credentials.passwordHash !== 'string'
      || !/^[\da-f]{32}$/i.test(credentials.salt)
      || !/^[\da-f]{128}$/i.test(credentials.passwordHash)
    ) {
      throw new Error('The knowledge administrator credentials file is invalid.');
    }
    return credentials as StoredCredentials;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`));
  return cookie ? cookie.slice(sessionCookieName.length + 1) : null;
}

function setSessionCookie(response: Parameters<RequestHandler>[1], token: string, secure: boolean): void {
  const secureAttribute = secure ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api/knowledge; Max-Age=${sessionDurationMs / 1000}${secureAttribute}`,
  );
}

function createSession(
  response: Parameters<RequestHandler>[1],
  token: string,
  username: string,
  secure: boolean,
): void {
  sessions.set(token, { username, expiresAt: Date.now() + sessionDurationMs });
  setSessionCookie(response, token, secure);
}

function getBodyCredentials(body: unknown): { username: string; password: string } | null {
  if (!body || typeof body !== 'object' || !('username' in body) || !('password' in body)) {
    return null;
  }

  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string') return null;

  return {
    username: username.trim().toLowerCase(),
    password,
  };
}

function isValidUsername(username: string): boolean {
  return /^[a-z0-9._-]{3,64}$/.test(username);
}

function isValidPassword(password: string): boolean {
  return password.length >= 12 && password.length <= 128;
}

const rejectCrossSiteAuthentication: RequestHandler = (request, response, next) => {
  if (request.get('sec-fetch-site') === 'cross-site') {
    response.status(403).json({ ok: false, message: 'Cross-site knowledge authentication requests are not allowed.' });
    return;
  }
  next();
};

router.get('/api/knowledge/auth/status', async (request, response) => {
  try {
    const credentials = await readCredentials();
    const token = readSessionToken(request.headers.cookie);
    const session = token ? sessions.get(token) : undefined;
    const authenticated = Boolean(session && session.expiresAt > Date.now());

    if (token && session && !authenticated) sessions.delete(token);
    response.json({ configured: Boolean(credentials), authenticated });
  } catch (error) {
    console.error('[knowledge-auth] failed to read administrator credentials:', error);
    response.status(500).json({ ok: false, message: 'Knowledge administrator status could not be checked.' });
  }
});

router.post('/api/knowledge/auth/setup', rejectCrossSiteAuthentication, async (request, response) => {
  const input = getBodyCredentials(request.body);
  if (!input || !isValidUsername(input.username)) {
    response.status(400).json({
      ok: false,
      message: 'Choose a username containing 3–64 letters, numbers, dots, underscores, or hyphens.',
    });
    return;
  }
  if (!isValidPassword(input.password)) {
    response.status(400).json({ ok: false, message: 'The administrator password must be 12–128 characters.' });
    return;
  }

  try {
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await derivePassword(input.password, salt)).toString('hex');
    const credentials: StoredCredentials = { username: input.username, salt, passwordHash };
    await fs.mkdir(storageDirectory, { recursive: true });
    await fs.writeFile(credentialsFile, JSON.stringify(credentials, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });

    const token = randomBytes(32).toString('base64url');
    createSession(response, token, input.username, request.secure);
    response.status(201).json({ ok: true, username: input.username });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      response.status(409).json({ ok: false, message: 'A knowledge administrator is already configured. Please log in.' });
      return;
    }
    console.error('[knowledge-auth] failed to configure administrator:', error);
    response.status(500).json({ ok: false, message: 'Knowledge administrator setup failed.' });
  }
});

router.post('/api/knowledge/auth/login', rejectCrossSiteAuthentication, async (request, response) => {
  const input = getBodyCredentials(request.body);
  if (!input || !isValidUsername(input.username) || !isValidPassword(input.password)) {
    response.status(400).json({ ok: false, message: 'Enter a valid username and password.' });
    return;
  }

  try {
    const credentials = await readCredentials();
    if (!credentials) {
      response.status(409).json({ ok: false, message: 'Set up the knowledge administrator before logging in.' });
      return;
    }

    const actualHash = await derivePassword(input.password, credentials.salt);
    const expectedHash = Buffer.from(credentials.passwordHash, 'hex');
    const usernameMatches = input.username === credentials.username;
    const passwordMatches = timingSafeEqual(actualHash, expectedHash);
    if (!usernameMatches || !passwordMatches) {
      response.status(401).json({ ok: false, message: 'The username or password is incorrect.' });
      return;
    }

    const token = randomBytes(32).toString('base64url');
    createSession(response, token, credentials.username, request.secure);
    response.json({ ok: true, username: credentials.username });
  } catch (error) {
    console.error('[knowledge-auth] login failed:', error);
    response.status(500).json({ ok: false, message: 'Knowledge administrator login failed.' });
  }
});

router.post('/api/knowledge/auth/logout', rejectCrossSiteAuthentication, (request, response) => {
  const token = readSessionToken(request.headers.cookie);
  if (token) sessions.delete(token);
  const secureAttribute = request.secure ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/api/knowledge; Max-Age=0${secureAttribute}`,
  );
  response.json({ ok: true });
});

export const requireKnowledgeAuth: RequestHandler = (request, response, next) => {
  const token = readSessionToken(request.headers.cookie);
  const session = token ? sessions.get(token) : undefined;

  if (!token || !session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    response.status(401).json({ ok: false, message: 'Sign in to manage knowledge files.' });
    return;
  }

  next();
};

export default router;
