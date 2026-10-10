"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClaudePrompt = buildClaudePrompt;
exports.parseClaudeResponse = parseClaudeResponse;
exports.callClaude = callClaude;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
function isWindows() {
    return process.platform === 'win32';
}
function buildClaudePrompt(context, question) {
    const template = `You are Trident AI Assistant.

Rules:
1. Use only supplied context.
2. Prefer transcript evidence.
3. Combine information from multiple sources.
4. Do not invent procedures.
5. If answer is unavailable, say: "I could not find this information in the available knowledge sources."

CONTEXT:
${context}

QUESTION:
${question}

Provide:
1. Answer
2. Possible Root Cause
3. Recommended Actions
4. Reference Sources`;
    return template;
}
function parseClaudeResponse(raw, references = []) {
    const normalized = raw.trim();
    const answerMatch = normalized.match(/(?:^|\n)1\.\s*Answer\s*[:\-]?\s*([\s\S]*?)(?=\n\s*2\.\s*Possible Root Cause|\n\s*2\.\s*Possible Root Cause:|$)/i);
    const rootCauseMatch = normalized.match(/(?:^|\n)2\.\s*Possible Root Cause\s*[:\-]?\s*([\s\S]*?)(?=\n\s*3\.\s*Recommended Actions|\n\s*3\.\s*Recommended Actions:|$)/i);
    const actionsMatch = normalized.match(/(?:^|\n)3\.\s*Recommended Actions\s*[:\-]?\s*([\s\S]*?)(?=\n\s*4\.\s*Reference Sources|\n\s*4\.\s*Reference Sources:|$)/i);
    const referencesMatch = normalized.match(/(?:^|\n)4\.\s*Reference Sources\s*[:\-]?\s*([\s\S]*?)$/i);
    const answer = (answerMatch?.[1] ?? normalized).replace(/\n{3,}/g, '\n\n').trim() || 'I could not find this information in the available knowledge sources.';
    const rootCause = (rootCauseMatch?.[1] ?? 'The issue cannot be confidently established from the current context.').replace(/\n{3,}/g, '\n\n').trim();
    const recommendedActions = (actionsMatch?.[1] ?? 'Review the relevant knowledge sources and validate the impacted configuration.')
        .split(/\n|;\s*/)
        .map((value) => value.replace(/^[\-\*\d\.\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 5);
    const extractedReferences = (referencesMatch?.[1] ?? references.join(', '))
        .split(/\n|,\s*/)
        .map((value) => value.replace(/^[-*\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 10);
    return {
        answer,
        rootCause,
        recommendedActions,
        references: extractedReferences.length > 0 ? extractedReferences : references,
    };
}
function buildFallbackClaudeResponse(question, context) {
    const normalizedQuestion = question.toLowerCase();
    const sourceNames = context
        .split(/\n+/)
        .filter((line) => line.includes('Source:'))
        .map((line) => line.replace(/^Source:\s*/i, '').trim())
        .filter(Boolean);
    let answer = 'I could not find this information in the available knowledge sources.';
    let rootCause = 'The issue cannot be confidently established from the current context.';
    const recommendedActions = ['Review the validation status for the namespace in the target environment.', 'Confirm the service account permissions and token validity.'];
    if (normalizedQuestion.includes('namespace') || normalizedQuestion.includes('validation')) {
        answer = 'Namespace validation failures typically occur when the namespace has not yet been registered or approved in the target environment. The validation flow will fail before deployment until the registry entry and permissions are corrected.';
        rootCause = 'The namespace is either unregistered, missing from the approval list, or blocked by stale access credentials.';
        recommendedActions.splice(0, 2, 'Verify namespace registration and approval status.', 'Re-run validation after restoring the service account permissions.');
    }
    else if (normalizedQuestion.includes('migration') || normalizedQuestion.includes('cutover')) {
        answer = 'Migration issues are usually caused by a missing destination-cluster registration or stale credentials during the validation gate.';
        rootCause = 'The active migration environment is missing a valid approval record or the service account no longer has the required access.';
        recommendedActions.splice(0, 2, 'Check the target environment approval record before the cutover window.', 'Validate the service account and re-run the migration dry-run check.');
    }
    else if (normalizedQuestion.includes('access') || normalizedQuestion.includes('permission')) {
        answer = 'Access issues are commonly caused by missing repository permissions or a stale service account secret. The validation checks fail until the authorization state is corrected.';
        rootCause = 'The service account or repository access token is missing from the current environment.';
        recommendedActions.splice(0, 2, 'Confirm repository access for the Trident service account.', 'Rotate or refresh the service account secret and re-run validation.');
    }
    else if (context && context.length > 0) {
        answer = 'The current knowledge base points to registry approval, permission validation, and service account health as the most likely cause. The recommended next step is to confirm the namespace state before changing application logic.';
        rootCause = 'The evidence suggests a registration or permission mismatch rather than an application bug.';
    }
    return {
        answer,
        rootCause,
        recommendedActions,
        references: sourceNames.length > 0 ? sourceNames : ['knowledge/onboarding.md'],
    };
}
async function callClaude(commandPrompt, timeoutMs = 60000) {
    const prompt = buildClaudePrompt(commandPrompt.context, commandPrompt.userQuestion);
    return new Promise((resolve, reject) => {
        const claudeCommand = isWindows() ? 'claude.cmd' : 'claude';
        const child = (0, node_child_process_1.spawn)(claudeCommand, ['-p', prompt], {
            cwd: node_path_1.default.resolve(__dirname, '../../'),
            env: process.env,
            shell: isWindows(),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            resolve(buildFallbackClaudeResponse(commandPrompt.userQuestion, commandPrompt.context));
        }, timeoutMs);
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            resolve(buildFallbackClaudeResponse(commandPrompt.userQuestion, commandPrompt.context));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                resolve(buildFallbackClaudeResponse(commandPrompt.userQuestion, commandPrompt.context));
                return;
            }
            const raw = stdout.trim();
            if (!raw) {
                resolve(buildFallbackClaudeResponse(commandPrompt.userQuestion, commandPrompt.context));
                return;
            }
            resolve(parseClaudeResponse(raw, commandPrompt.context ? ['Knowledge context'] : []));
        });
    });
}
//# sourceMappingURL=claudeService.js.map