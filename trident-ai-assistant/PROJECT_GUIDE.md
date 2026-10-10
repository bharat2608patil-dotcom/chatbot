# Trident AI Assistant Project Guide

This guide describes the current project: what each part does, how to start it, what happens after a user submits a question, where the prompt and chat data are stored, and how to diagnose common problems.

## 1. What the Application Does

Trident AI Assistant is a local knowledge-base chat application. A user asks a question in the web interface. The server searches Markdown documents under `knowledge/`, selects relevant paragraphs, builds a prompt containing those paragraphs and the question, saves that prompt, and sends it to Claude Code CLI. The server then returns the result to the web interface and records the conversation locally.

The main parts are:

- **Frontend:** React, TypeScript, Vite, and Material UI chat interface.
- **Backend:** Express and TypeScript API, retrieval, storage, and Claude CLI integration.
- **Knowledge base:** Markdown documents searched by the backend.
- **Local storage:** JSON query and chat-history files, plus the latest generated Claude prompt.
- **Claude:** Claude Code CLI invoked in non-interactive print mode. This is a CLI integration, not a direct Anthropic API integration.

## 2. Project Structure

```text
trident-ai-assistant/
|-- PROJECT_GUIDE.md
|-- backend/
|   |-- package.json
|   |-- tsconfig.json
|   `-- src/
|       |-- server.ts
|       |-- routes/chat.ts
|       |-- routes/knowledge.ts
|       |-- retrieval/retrievalService.ts
|       |-- services/claudeService.ts
|       |-- storage/storage.ts
|       `-- types.ts
|-- frontend/
|   |-- package.json
|   |-- vite.config.ts
|   `-- src/
|       |-- App.tsx
|       |-- services/chatApi.ts
|       `-- types/chat.ts
|-- knowledge/
|   |-- jira_runbooks.md
|   |-- migration_guide.md
|   |-- onboarding.md
|   |-- trident_faq.md
|   `-- office_hours_sessions/
`-- storage/
    |-- queries.json
    |-- chat-history.json
    `-- claude-prompt.txt
```

Other folders under `backend/src` and `frontend/src` contain supporting modules, styles, assets, and types.

### Important Files

- `frontend/src/App.tsx`: Displays the chat, sends a question, and displays the returned answer.
- `frontend/src/services/chatApi.ts`: Makes `POST /api/chat` requests.
- `frontend/vite.config.ts`: Runs the frontend at port `5173` and proxies `/api` requests to the backend at `localhost:4000`.
- `backend/src/server.ts`: Starts Express, enables JSON request parsing and CORS, and mounts the chat routes.
- `backend/src/routes/chat.ts`: Validates the request, saves the query, runs retrieval, calls Claude, records messages, and returns the API response.
- `backend/src/routes/knowledge.ts`: Accepts Markdown uploads, validates and saves them under `knowledge/` without overwriting an existing file.
- `backend/src/retrieval/retrievalService.ts`: Finds and ranks paragraphs from Markdown knowledge files.
- `backend/src/services/claudeService.ts`: Builds and saves the prompt, invokes Claude Code CLI, logs its output, parses the response, and provides a local fallback when the CLI fails.
- `backend/src/storage/storage.ts`: Reads and writes query and chat-history JSON files.
- `backend/src/types.ts`: Backend request, response, retrieval, and message types.

## 3. Prerequisites

Install the following on the computer running the app:

1. Node.js and npm versions compatible with the versions in the project lockfiles.
2. Claude Code CLI installed and available as `claude` in a terminal.
3. Claude Code CLI authenticated with an account or billing setup accepted by Anthropic.

Check that Node.js, npm, and Claude Code CLI are available:

```powershell
node --version
npm --version
claude --version
claude auth status
```

The app uses the CLI identity/configuration of the Windows account running the backend. A Claude website session alone does not make the `claude` command available to the backend.

## 4. Install and Run the Application

The frontend and backend are separate npm projects. Install and run each one in its own terminal.

### Terminal 1: Backend

```powershell
cd path\to\trident-ai-assistant\backend
npm install
npm run dev
```

The backend defaults to `http://localhost:4000`. It can use a different port through the `PORT` environment variable.

### Terminal 2: Frontend

```powershell
cd path\to\trident-ai-assistant\frontend
npm install
npm run dev
```

Open `http://localhost:5173` in a browser. Keep both terminal processes running while using the app.

### Upload a Knowledge File

Use **Upload .md** in the chat header and select a UTF-8 Markdown (`.md`) file. The backend accepts one file at a time, with a maximum size of 5 MB. It sanitizes the stored filename and returns a conflict response if a file with that name already exists; rename the upload to add it under another name. Uploaded Markdown is saved directly under `knowledge/` and is eligible for retrieval on the next question.

Uploads of other formats are intentionally not supported yet. Add format-specific text extraction in a later parser step before allowing those extensions.

### Build Checks

Run these commands from their respective directories:

```powershell
# backend/
npm run build

# frontend/
npm run build
npm run lint
```

## 5. Full Question-to-Answer Flow

When a user submits a question, the application performs these steps:

1. **Frontend accepts the question.** `App.tsx` adds the user's message to the chat and calls `sendChatQuestion`.
2. **Frontend sends an API request.** `chatApi.ts` sends JSON such as `{ "question": "Why did onboarding return access denied?" }` to `POST /api/chat`.
3. **Vite forwards the request.** During development, Vite proxies `/api` from port `5173` to Express on port `4000`.
4. **Backend validates and trims the text.** `chat.ts` rejects an empty question with HTTP 400.
5. **Backend saves the query.** The question and timestamp are appended to `storage/queries.json`.
6. **Retrieval scans Markdown.** The retrieval service recursively scans `.md` files under `knowledge/`, splits the documents into paragraph-like blocks, and ignores blocks shorter than 81 characters.
7. **Retrieval ranks candidate blocks.** It normalizes the question and document text, scores query-term matches, adds extra weights for terms such as `namespace`, `migration`, `incident`, `access`, and `approval`, sorts by score, and selects up to five blocks.
8. **Backend builds the context.** Each selected block is included with its source path and heading. If nothing matches, the context says that no relevant source material was found.
9. **Claude prompt is built.** `claudeService.ts` combines the assistant rules, selected context, user question, and the requested four-section answer format.
10. **Prompt is saved.** The full prompt overwrites `storage/claude-prompt.txt`. This file contains the latest request only, not a history of prompts.
11. **Claude Code CLI is invoked.** The process runs in print mode (`-p`) from the project root. The prompt is piped through stdin; a short instruction is passed as the CLI prompt argument. Claude Code must be installed, authenticated, and usable by the account running the backend.
12. **Backend captures process output.** It collects stdout and stderr, logs the exit code and complete stdout, and labels the response source.
13. **Backend interprets the response.** It extracts Answer, Possible Root Cause, Recommended Actions, and Reference Sources when Claude returns those headings. The response is sent to the frontend.
14. **Backend saves chat history.** User and assistant messages are appended to `storage/chat-history.json`.
15. **Frontend displays the returned answer.** It displays the `answer` returned by the backend and the references.

## 6. Retrieval: What Claude Receives

Retrieval is a simple keyword-based method, not a vector database or semantic embedding search. It examines the local Markdown files and passes the selected paragraph contents to Claude. Claude does not have to discover the knowledge files to answer from those supplied excerpts.

The backend selects at most five paragraphs. Therefore:

- The complete knowledge base is not placed into each prompt.
- A relevant paragraph can be missed if it does not score highly for the question's words or the built-in weighted terms.
- Adding or editing `.md` files under `knowledge/` changes future retrieval without a separate indexing step.
- The selected source paths and paragraph content are printed in the backend logs.

Claude Code is started with the project root as its current working directory. The prompt instructs it to use the supplied context and not greet the user. The server-generated context remains the core knowledge supplied for the request.

## 7. Prompt File and Logs

### Latest Prompt

The server automatically creates or replaces:

```text
storage/claude-prompt.txt
```

Open this file to inspect or manually submit the most recent complete prompt. If no user request has reached the Claude service since startup, it may contain an older prompt.

### Backend Logs

The backend terminal logs include:

- Incoming and cleaned question.
- Number of Markdown files scanned and retrieved chunks selected.
- Chunk source, relevance score, heading, and content.
- Context assembled for Claude.
- Exact prompt and its saved path.
- CLI command, working directory, and instruction argument.
- CLI exit code, stderr on failure, complete raw stdout, and response-source label.

Look for log markers such as:

```text
[claude] response source: Claude CLI stdout
--- CLI STDOUT BEGIN ---
...
--- CLI STDOUT END ---
```

If the raw stdout contains “I’m ready to help,” that text came from the Claude CLI. It is not one of the backend's fallback answers. If the response-source log says `local fallback`, the app generated the response locally because the CLI failed, timed out, exited unsuccessfully, or returned empty output.

Logs and `claude-prompt.txt` contain user questions and retrieved knowledge text. Do not share them publicly if the data is private or confidential.

## 8. Local Data Files

- `storage/queries.json`: Array of submitted questions and timestamps.
- `storage/chat-history.json`: Array of user and assistant messages, timestamps, and references.
- `storage/claude-prompt.txt`: The latest full prompt. It is overwritten on the next request.

These files are local JSON/text storage, not a database. The current chat screen starts with a fixed welcome message; the code does not currently load persisted chat history into the frontend on startup.

## 9. API Endpoints

### `GET /api/health`

Returns a basic health response containing `ok`, service name, and timestamp.

### `POST /api/chat`

Request:

```json
{
  "question": "Why do we see access denied errors during onboarding?"
}
```

Successful response fields:

- `answer`: Main answer text.
- `rootCause`: Possible cause.
- `recommendedActions`: List of suggested actions.
- `references`: Source references.
- `timestamp`: Response timestamp.

An empty question returns HTTP 400. An unexpected server error returns HTTP 500 with a message.

### `POST /api/knowledge/upload`

Send a multipart form-data request with one file field named `file`:

```text
file: <UTF-8 Markdown file, maximum 5 MB>
```

Successful uploads return HTTP 201 with `ok`, `message`, `fileName`, and `sizeBytes`. Unsupported file types or invalid Markdown receive HTTP 400, files over the size limit receive HTTP 413, and a duplicate filename receives HTTP 409. The original upload is stored as Markdown; no document parser or format conversion is performed yet.

## 10. Common Troubleshooting

### The answer says “I’m ready to help”

Check the backend's delimited raw stdout. If the phrase is between `CLI STDOUT BEGIN` and `CLI STDOUT END` and the source is `Claude CLI stdout`, Claude Code emitted it. Confirm the backend is running the latest code, the saved prompt contains the current question and relevant excerpts, and the CLI is authenticated as expected. The prompt explicitly asks Claude not to greet and to follow the four-section format.

### The answer is a local generic response

Find the `response source: local fallback` message immediately before the response. Check the nearby timeout, launch error, exit code, stderr, or empty-output log to see why the CLI was not used successfully.

### No relevant chunks were retrieved

Look for `scanning ... markdown files`, `no relevant knowledge chunks found`, and `selected top ... chunks`. Confirm the knowledge documents are `.md` files under the repository's `knowledge/` directory and that their content contains the concepts/terms in the question.

### The prompt file did not change

Confirm a non-empty question was sent to the backend, check whether the prompt-save warning was logged, and verify you are opening the `storage/claude-prompt.txt` file in the same project copy that is running.

### Check Claude Code independently

From the repository root, first confirm `claude --version` and `claude auth status`. You can then test the saved prompt directly in PowerShell:

```powershell
Get-Content .\storage\claude-prompt.txt -Raw | claude -p "Answer the Trident support request supplied through stdin. Do not greet the user; follow its requested response format."
```

This helps separate a CLI/account issue from the web application's request path.

### Ports are already occupied

The backend defaults to port `4000`; set `PORT` to use a different backend port. The Vite development server defaults to port `5173`. If changing the backend port, update the `/api` proxy target in `frontend/vite.config.ts` to match.

## 11. Current Limitations and Safety Notes

- Retrieval is keyword scoring over paragraph blocks; it is not semantic/vector search.
- The maximum retrieved context is five blocks per question.
- Data is stored in local JSON files; there is no database, multi-user identity, or access-control layer in the current implementation.
- Prompt snapshots and backend logs include submitted questions and retrieved source content.
- The development servers bind to network interfaces for access from other devices. The API currently has no authentication. Use only on a trusted network and do not expose it directly to the public internet without adding authentication, authorization, and appropriate data protections.
- Claude Code CLI authentication and usage requirements are controlled by the installed CLI version and Anthropic account configuration.

## 12. Useful Test Questions

- Why do we see access denied errors during onboarding?
- What usually causes migration validation to fail?
- What should the team check before the migration cutover?
- Which permissions does the Trident service account need?
- What should be included in the migration decision record?
