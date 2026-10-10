import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ClaudeResponse, ClaudeRequest } from '../types';

function isWindows(): boolean {
  return process.platform === 'win32';
}

function stripMarkdownFormatting(value: string): string {
  return value
    .replace(/^(?:#+|\*\*|__|\s)+/, '')
    .replace(/(?:\*\*|__|~~|`)/g, '')
    .replace(/^(?:\d+\.|[-*])\s+/gm, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanSectionValue(value: string): string {
  return stripMarkdownFormatting(value)
    .replace(/^[:\-\s]+/, '')
    .replace(/\s+\*\*$/g, '')
    .trim();
}

function formatAnswer(answer: string, rootCause: string, actions: string[], references: string[]): string {
  return [
    'Answer',
    answer,
    '',
    'Possible Root Cause',
    rootCause,
    '',
    'Recommended Actions',
    ...actions.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Reference Sources',
    ...references.map((item) => `- ${item}`),
  ].join('\n');
}

export function buildClaudePrompt(context: string, question: string): string {
  const template = `You are Trident AI Assistant.

Rules:
1. Use only supplied context.
2. Prefer transcript evidence.
3. Combine information from multiple sources.
4. Do not invent procedures.
5. If answer is unavailable, say: "I could not find this information in the available knowledge sources."
6. Do not greet the user or say you are ready to help. Start directly with the requested answer format.
7. Output plain text only. Do not use Markdown headings like ##, bold like **text**, or bullet markers. Use only the required numbered sections.
8. In Reference Sources, cite only the sources supplied in the context.

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

export function parseClaudeResponse(raw: string, references: string[] = []): ClaudeResponse {
  const normalized = raw.trim();
  const sectionPattern = /(?:^|\n)\s*(?:#+\s*)?(?:\*\*)?\s*(?:\d+\.\s*)?(Answer|Possible Root Cause|Recommended Actions|Reference Sources)(?:\*\*)?\s*[:\-]?\s*([\s\S]*?)(?=\n\s*(?:#+\s*)?(?:\*\*)?\s*(?:\d+\.\s*)?(?:Answer|Possible Root Cause|Recommended Actions|Reference Sources)(?:\*\*)?\s*[:\-]?|$)/gi;

  const sections = new Map<string, string>();
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(normalized)) !== null) {
    const key = match[1].trim().toLowerCase();
    const value = (match[2] ?? '').trim();
    sections.set(key, value);
  }

  const answerText = cleanSectionValue(sections.get('answer') ?? normalized);
  const rootCause = cleanSectionValue(
    sections.get('possible root cause') ?? 'The issue cannot be confidently established from the current context.'
  );
  const recommendedActions = (cleanSectionValue(sections.get('recommended actions') ?? 'Review the relevant knowledge sources and validate the impacted configuration.'))
    .split(/\n|;\s*/)
    .map((value) => value.replace(/^[\-\*\d\.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 5);

  const extractedReferences = (cleanSectionValue(sections.get('reference sources') ?? references.join(', ')))
    .split(/\n|,\s*/)
    .map((value) => value.replace(/^[-*\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 10);

  const finalReferences = references.length > 0 ? references : extractedReferences;

  return {
    answer: formatAnswer(
      answerText || 'I could not find this information in the available knowledge sources.',
      rootCause,
      recommendedActions,
      finalReferences,
    ),
    rootCause,
    recommendedActions,
    references: finalReferences,
  };
}

export async function callClaude(commandPrompt: ClaudeRequest, timeoutMs = 60000): Promise<ClaudeResponse> {
  const prompt = buildClaudePrompt(commandPrompt.context, commandPrompt.userQuestion);
  console.log('[claude] prompt prepared');
  console.log(`[claude] prompt length: ${prompt.length}`);
  console.log('[claude] exact prompt passed to CLI:');
  console.log(prompt);

  const promptFile = path.resolve(__dirname, '../../../storage/claude-prompt.txt');
  try {
    await fs.mkdir(path.dirname(promptFile), { recursive: true });
    await fs.writeFile(promptFile, prompt, 'utf8');
    console.log(`[claude] prompt saved to ${promptFile}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[claude] could not save prompt file: ${message}`);
  }

  return new Promise((resolve, reject) => {
    const claudeCommand = isWindows() ? 'claude.cmd' : 'claude';
    console.log(`[claude] starting CLI: ${claudeCommand}`);
    const cliInstruction = 'Answer the Trident support request supplied through stdin. Do not greet the user; follow its requested response format.';
    const projectRoot = path.resolve(__dirname, '../../../');
    console.log(`[claude] CLI working directory: ${projectRoot}`);
    console.log(`[claude] CLI instruction argument: ${cliInstruction}`);

    const child = spawn(claudeCommand, ['-p', cliInstruction], {
      cwd: projectRoot,
      env: process.env,
      shell: isWindows(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(message));
    };
    const succeed = (response: ClaudeResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };

    timer = setTimeout(() => {
      console.warn(`[claude] timeout after ${timeoutMs}ms`);
      console.log(`[claude] partial CLI stdout before timeout (${stdout.length} characters):`);
      console.log(`--- CLI STDOUT BEGIN ---\n${stdout}\n--- CLI STDOUT END ---`);
      console.error('[claude] response unavailable: CLI timed out');
      child.kill('SIGTERM');
      fail('Claude Code CLI timed out. Please try again.');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      console.error('[claude] failed to start CLI:', error.message);
      console.error('[claude] response unavailable: CLI failed to start');
      fail('Claude Code CLI could not be started. Check that it is installed and available to the backend.');
    });

    child.stdin.on('error', (error) => {
      console.error('[claude] failed to send prompt to CLI:', error.message);
      fail('The prompt could not be sent to Claude Code CLI. Please try again.');
    });

    child.stdin.end(prompt, 'utf8');

    child.on('close', (code) => {
      console.log(`[claude] CLI process closed with exit code: ${code}`);
      console.log(`[claude] raw CLI stdout (${stdout.length} characters):`);
      console.log(`--- CLI STDOUT BEGIN ---\n${stdout}\n--- CLI STDOUT END ---`);

      if (code !== 0) {
        console.error(`[claude] CLI exited with code ${code}`);
        console.error(`[claude] stderr: ${stderr.trim() || 'no stderr output'}`);
        console.error('[claude] response unavailable: CLI exited unsuccessfully');
        fail(`Claude Code CLI exited unsuccessfully${stderr.trim() ? `: ${stderr.trim()}` : '.'}`);
        return;
      }

      const raw = stdout.trim();
      if (!raw) {
        console.warn('[claude] CLI returned empty output');
        fail('Claude Code CLI returned an empty response. Please try again.');
        return;
      }

      console.log('[claude] response source: Claude CLI stdout');
      succeed(parseClaudeResponse(raw, commandPrompt.references ?? []));
    });
  });
}
