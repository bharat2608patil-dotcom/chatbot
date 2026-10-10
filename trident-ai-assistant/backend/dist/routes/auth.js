"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const knowledgeAuth_1 = require("../services/knowledgeAuth");
const router = (0, express_1.Router)();
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 12;
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const failedLogins = new Map();
function isSecureRequest(request) {
    return process.env.NODE_ENV === 'production' || request.secure;
}
router.get('/api/auth/status', async (request, response) => {
    try {
        response.json({
            configured: await (0, knowledgeAuth_1.isKnowledgeAuthConfigured)(),
            authenticated: (0, knowledgeAuth_1.isKnowledgeSessionActive)(request.headers.cookie),
            csrfToken: (0, knowledgeAuth_1.getKnowledgeCsrfToken)(request.headers.cookie),
        });
    }
    catch (error) {
        console.error('[auth] failed to read authentication status:', error);
        response.status(500).json({ ok: false, message: 'Knowledge authentication status could not be read.' });
    }
});
router.post('/api/auth/setup', async (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const setupCode = typeof request.body?.setupCode === 'string' ? request.body.setupCode : '';
    if (username.length < 3 || username.length > MAX_USERNAME_LENGTH) {
        response.status(400).json({ ok: false, message: 'Username must be between 3 and 64 characters.' });
        return;
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        response.status(400).json({ ok: false, message: 'Password must be between 12 and 128 characters.' });
        return;
    }
    try {
        await (0, knowledgeAuth_1.createKnowledgeAdmin)(username, password, setupCode);
        const session = (0, knowledgeAuth_1.createKnowledgeSession)();
        response.setHeader('Set-Cookie', (0, knowledgeAuth_1.setKnowledgeSessionCookie)(session.token, isSecureRequest(request)));
        response.status(201).json({ ok: true, configured: true, authenticated: true, csrfToken: session.csrfToken });
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('The first-run setup code is invalid.')) {
            response.status(403).json({ ok: false, message: error.message });
            return;
        }
        if (error instanceof Error && error.message === 'Knowledge administrator setup has already been completed.') {
            response.status(409).json({ ok: false, message: error.message });
            return;
        }
        console.error('[auth] failed to create knowledge administrator:', error);
        response.status(500).json({ ok: false, message: 'Knowledge administrator could not be created.' });
    }
});
router.post('/api/auth/login', async (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!username || !password || username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        response.status(400).json({ ok: false, message: 'Enter a valid username and password.' });
        return;
    }
    const clientKey = request.ip || 'unknown';
    const loginState = failedLogins.get(clientKey);
    if (loginState && loginState.lockedUntil > Date.now()) {
        response.status(429).json({ ok: false, message: 'Too many failed login attempts. Try again in 15 minutes.' });
        return;
    }
    if (loginState && loginState.lockedUntil > 0 && loginState.lockedUntil <= Date.now()) {
        failedLogins.delete(clientKey);
    }
    try {
        if (!(await (0, knowledgeAuth_1.isKnowledgeAuthConfigured)())) {
            response.status(409).json({ ok: false, message: 'Create the knowledge administrator before logging in.' });
            return;
        }
        if (!(await (0, knowledgeAuth_1.verifyKnowledgeAdmin)(username, password))) {
            const currentState = failedLogins.get(clientKey) ?? { count: 0, lockedUntil: 0 };
            currentState.count += 1;
            if (currentState.count >= MAX_FAILED_LOGINS) {
                currentState.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
            }
            failedLogins.set(clientKey, currentState);
            response.status(401).json({ ok: false, message: 'Incorrect username or password.' });
            return;
        }
        failedLogins.delete(clientKey);
        const session = (0, knowledgeAuth_1.createKnowledgeSession)();
        response.setHeader('Set-Cookie', (0, knowledgeAuth_1.setKnowledgeSessionCookie)(session.token, isSecureRequest(request)));
        response.json({ ok: true, configured: true, authenticated: true, csrfToken: session.csrfToken });
    }
    catch (error) {
        console.error('[auth] login failed:', error);
        response.status(500).json({ ok: false, message: 'Knowledge administrator login failed.' });
    }
});
router.post('/api/auth/logout', (request, response) => {
    (0, knowledgeAuth_1.revokeKnowledgeSession)(request.headers.cookie);
    response.setHeader('Set-Cookie', (0, knowledgeAuth_1.clearKnowledgeSessionCookie)(isSecureRequest(request)));
    response.json({ ok: true, configured: true, authenticated: false });
});
exports.default = router;
//# sourceMappingURL=auth.js.map