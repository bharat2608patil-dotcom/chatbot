"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireKnowledgeAuth = void 0;
exports.getKnowledgeSetupCode = getKnowledgeSetupCode;
exports.isKnowledgeAuthConfigured = isKnowledgeAuthConfigured;
exports.createKnowledgeAdmin = createKnowledgeAdmin;
exports.verifyKnowledgeAdmin = verifyKnowledgeAdmin;
exports.createKnowledgeSession = createKnowledgeSession;
exports.isKnowledgeSessionActive = isKnowledgeSessionActive;
exports.getKnowledgeCsrfToken = getKnowledgeCsrfToken;
exports.revokeKnowledgeSession = revokeKnowledgeSession;
exports.setKnowledgeSessionCookie = setKnowledgeSessionCookie;
exports.clearKnowledgeSessionCookie = clearKnowledgeSessionCookie;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const CREDENTIALS_FILE = node_path_1.default.resolve(__dirname, '../../../storage/auth.json');
const SESSION_COOKIE = 'knowledge_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const PASSWORD_HASH_BYTES = 64;
const KNOWLEDGE_SETUP_CODE = (0, node_crypto_1.randomBytes)(24).toString('hex');
const sessions = new Map();
function getKnowledgeSetupCode() {
    return KNOWLEDGE_SETUP_CODE;
}
function derivePasswordHash(password, salt) {
    return new Promise((resolve, reject) => {
        (0, node_crypto_1.scrypt)(password, salt, PASSWORD_HASH_BYTES, (error, derivedKey) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(derivedKey);
        });
    });
}
function isStoredCredentials(value) {
    if (!value || typeof value !== 'object')
        return false;
    const credentials = value;
    return typeof credentials.username === 'string'
        && typeof credentials.salt === 'string'
        && typeof credentials.passwordHash === 'string';
}
async function readCredentials() {
    let content;
    try {
        content = await node_fs_1.promises.readFile(CREDENTIALS_FILE, 'utf8');
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        throw new Error('Knowledge authentication file is invalid JSON.');
    }
    if (!isStoredCredentials(parsed)) {
        throw new Error('Knowledge authentication file has an invalid format.');
    }
    return parsed;
}
async function isKnowledgeAuthConfigured() {
    return (await readCredentials()) !== null;
}
async function createKnowledgeAdmin(username, password, setupCode) {
    const expectedCode = Buffer.from(KNOWLEDGE_SETUP_CODE, 'hex');
    const providedCode = /^[a-f0-9]{48}$/i.test(setupCode) ? Buffer.from(setupCode, 'hex') : Buffer.alloc(0);
    if (providedCode.length !== expectedCode.length || !(0, node_crypto_1.timingSafeEqual)(expectedCode, providedCode)) {
        throw new Error('The first-run setup code is invalid. Check the backend terminal and try again.');
    }
    await node_fs_1.promises.mkdir(node_path_1.default.dirname(CREDENTIALS_FILE), { recursive: true });
    const salt = (0, node_crypto_1.randomBytes)(16).toString('hex');
    const passwordHash = (await derivePasswordHash(password, salt)).toString('hex');
    const credentials = { username, salt, passwordHash };
    try {
        await node_fs_1.promises.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
            throw new Error('Knowledge administrator setup has already been completed.');
        }
        throw error;
    }
}
async function verifyKnowledgeAdmin(username, password) {
    const credentials = await readCredentials();
    if (!credentials || credentials.username !== username)
        return false;
    const expectedHash = Buffer.from(credentials.passwordHash, 'hex');
    const actualHash = await derivePasswordHash(password, credentials.salt);
    return expectedHash.length === actualHash.length && (0, node_crypto_1.timingSafeEqual)(expectedHash, actualHash);
}
function createKnowledgeSession() {
    const now = Date.now();
    for (const [token, session] of sessions) {
        if (session.expiresAt <= now)
            sessions.delete(token);
    }
    const token = (0, node_crypto_1.randomBytes)(32).toString('hex');
    const csrfToken = (0, node_crypto_1.randomBytes)(32).toString('hex');
    sessions.set(token, { expiresAt: now + SESSION_DURATION_MS, csrfToken });
    return { token, csrfToken };
}
function readSessionToken(cookieHeader) {
    const cookie = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    const token = cookie?.slice(SESSION_COOKIE.length + 1);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
function isKnowledgeSessionActive(cookieHeader) {
    const token = readSessionToken(cookieHeader);
    if (!token)
        return false;
    const session = sessions.get(token);
    if (!session)
        return false;
    if (session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return false;
    }
    return true;
}
function getKnowledgeCsrfToken(cookieHeader) {
    const token = readSessionToken(cookieHeader);
    if (!token)
        return null;
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now())
        return null;
    return session.csrfToken;
}
function revokeKnowledgeSession(cookieHeader) {
    const token = readSessionToken(cookieHeader);
    if (token)
        sessions.delete(token);
}
function setKnowledgeSessionCookie(token, secure) {
    return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DURATION_MS / 1000}${secure ? '; Secure' : ''}`;
}
function clearKnowledgeSessionCookie(secure) {
    return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
const requireKnowledgeAuth = (request, response, next) => {
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
        if (expectedBuffer.length !== providedBuffer.length || !(0, node_crypto_1.timingSafeEqual)(expectedBuffer, providedBuffer)) {
            response.status(403).json({ ok: false, message: 'Knowledge management request could not be verified. Log in again.' });
            return;
        }
    }
    next();
};
exports.requireKnowledgeAuth = requireKnowledgeAuth;
//# sourceMappingURL=knowledgeAuth.js.map