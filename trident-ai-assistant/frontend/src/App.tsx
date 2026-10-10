import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  CssBaseline,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
  useMediaQuery,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import { deleteKnowledgeFile, getKnowledgeFiles, loadChatHistory, sendChatQuestion, uploadKnowledgeFile } from './services/chatApi';
import type { ChatMessage, ChatResponse, KnowledgeFile } from './types/chat';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOAD_PREVIEW_CHARACTERS = 5000;

function pathlessFileName(relativePath: string): string {
  return relativePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? relativePath;
}

const suggestedQuestionCatalog: Array<{ matches: RegExp; questions: string[] }> = [
  {
    matches: /onboarding/i,
    questions: [
      'Why can namespace validation fail even when the application configuration is complete?',
      'What permissions does the Trident service account need during onboarding?',
      'What steps should I follow to get a new namespace through validation?',
    ],
  },
  {
    matches: /migration/i,
    questions: [
      'What usually causes migration validation to fail?',
      'What should we check before the migration cutover?',
      'What information belongs in the migration decision record?',
    ],
  },
  {
    matches: /jira_runbooks/i,
    questions: [
      'What is the recommended first step when namespace validation fails?',
      'What information should be captured before escalating a validation incident?',
    ],
  },
  {
    matches: /trident_faq/i,
    questions: [
      'What are the most common causes of Trident validation failures?',
      'What should the team check before changing application code?',
    ],
  },
  {
    matches: /session_001/i,
    questions: ['Why does target-environment approval matter before a migration cutover?'],
  },
  {
    matches: /session_002/i,
    questions: ['Why can namespace validation fail before repository access is checked?'],
  },
  {
    matches: /session_003/i,
    questions: ['What should we verify if namespace validation reports service-account access problems?'],
  },
];

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#76e4ff' },
    background: { default: '#07141c', paper: '#0d1c28' },
    text: { primary: '#e3f4ff', secondary: '#a7c0d1' },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Inter, Roboto, sans-serif',
    h4: { fontWeight: 700 },
  },
});

const starterMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'I can help with namespace validation, migration checkpoints, access issues, and incident follow-up. Ask about the current Trident problem and I will answer from the knowledge store.',
  timestamp: new Date().toISOString(),
  references: ['onboarding.md', 'office_hours_sessions/session_001.md'],
};

function App() {
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [messages, setMessages] = useState<ChatMessage[]>([starterMessage]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingKnowledge, setUploadingKnowledge] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [knowledgeFilesOpen, setKnowledgeFilesOpen] = useState(false);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [deletingFile, setDeletingFile] = useState('');
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const [uploadPreviewLoading, setUploadPreviewLoading] = useState(false);
  const [uploadPreviewError, setUploadPreviewError] = useState('');
  const [chatNotice, setChatNotice] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState('');
  const [uploadFeedback, setUploadFeedback] = useState<{
    severity: 'success' | 'error';
    message: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadChatHistory()
      .then((history) => {
        if (!cancelled) setMessages(history.length > 0 ? history : [starterMessage]);
      })
      .catch((historyError: unknown) => {
        if (!cancelled) {
          setError(historyError instanceof Error ? historyError.message : 'Unable to load chat history.');
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getKnowledgeFiles()
      .then((files) => {
        if (!cancelled) setKnowledgeFiles(files);
      })
      .catch((filesError: unknown) => {
        if (!cancelled) {
          setChatNotice({
            severity: 'error',
            message: filesError instanceof Error ? filesError.message : 'Unable to load knowledge files for suggested questions.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const refreshKnowledgeFiles = async () => {
    const files = await getKnowledgeFiles();
    setKnowledgeFiles(files);
  };

  const filteredKnowledgeFiles = knowledgeFiles.filter((file) =>
    file.relativePath.toLowerCase().includes(knowledgeSearch.trim().toLowerCase())
  );

  const suggestedQuestions = [...new Set(
    knowledgeFiles.flatMap((file) => {
      const matchingGroup = suggestedQuestionCatalog.find((group) => group.matches.test(file.relativePath));
      if (matchingGroup) return matchingGroup.questions;
      if (file.relativePath.toLowerCase().endsWith('.txt')) {
        return [`What are the key points in the ${pathlessFileName(file.relativePath)} transcript?`];
      }
      return [`What are the key steps and recommendations in ${pathlessFileName(file.relativePath)}?`];
    })
  )].slice(0, 6);

  const handleToggleKnowledgeFiles = async () => {
    const open = !knowledgeFilesOpen;
    setKnowledgeFilesOpen(open);
    if (!open) return;

    setUploadFeedback(null);
    setKnowledgeSearch('');
    try {
      await refreshKnowledgeFiles();
    } catch (filesError) {
      setUploadFeedback({
        severity: 'error',
        message: filesError instanceof Error ? filesError.message : 'Unable to load knowledge files.',
      });
    }
  };

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || loading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setError('');
    setChatNotice(null);
    setLoading(true);

    try {
      const result: ChatResponse = await sendChatQuestion(trimmed);

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        timestamp: result.timestamp,
        references: result.references,
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The assistant could not answer the request.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleUploadFileSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setPendingUploadFile(file);
    setUploadPreview('');
    setUploadPreviewError('');
    if (!['.md', '.txt'].includes(file.name.slice(file.name.lastIndexOf('.')).toLowerCase())) {
      setUploadPreviewError('Only Markdown (.md) and plain-text (.txt) files are supported.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadPreviewError('The selected file exceeds the 5 MB upload limit.');
      return;
    }

    setUploadPreviewLoading(true);
    try {
      const content = await file.text();
      if (!content.trim() || content.includes('\0')) {
        setUploadPreviewError('The selected file must contain readable text.');
      } else {
        setUploadPreview(content);
      }
    } catch (previewError) {
      setUploadPreviewError(previewError instanceof Error ? previewError.message : 'Unable to preview this file.');
    } finally {
      setUploadPreviewLoading(false);
    }
  };

  const handleConfirmKnowledgeUpload = async () => {
    if (!pendingUploadFile || uploadPreviewError || uploadPreviewLoading) return;

    setUploadingKnowledge(true);
    setUploadFeedback(null);
    try {
      const result = await uploadKnowledgeFile(pendingUploadFile);
      setPendingUploadFile(null);
      setUploadPreview('');
      setUploadPreviewError('');
      setUploadFeedback({
        severity: 'success',
        message: `${result.fileName} was added to the knowledge base.`,
      });
    } catch (uploadError) {
      setUploadFeedback({
        severity: 'error',
        message: uploadError instanceof Error ? uploadError.message : 'Unable to upload the knowledge file.',
      });
      return;
    } finally {
      setUploadingKnowledge(false);
    }

    try {
      await refreshKnowledgeFiles();
    } catch (filesError) {
      setUploadFeedback({
        severity: 'error',
        message: `The file was uploaded, but the knowledge file list could not be refreshed: ${filesError instanceof Error ? filesError.message : 'Unknown error.'}`,
      });
    }
  };

  const handleCopyAnswer = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      setChatNotice({ severity: 'success', message: 'Answer copied to clipboard.' });
      window.setTimeout(() => setCopiedMessageId(''), 2000);
    } catch (copyError) {
      setChatNotice({
        severity: 'error',
        message: copyError instanceof Error ? `Could not copy answer: ${copyError.message}` : 'Could not copy answer to clipboard.',
      });
    }
  };

  const handleClearVisibleChat = () => {
    if (!messages.some((message) => message.role === 'user')) return;
    if (!window.confirm('Clear the visible chat? Saved chat history will not be deleted and may reappear when you reload.')) return;

    setMessages([starterMessage]);
    setDraft('');
    setError('');
    setChatNotice({ severity: 'success', message: 'Visible chat cleared. Saved history is unchanged.' });
  };

  const handleDeleteKnowledgeFile = async (file: KnowledgeFile) => {
    if (!window.confirm(`Delete ${file.relativePath} from the knowledge base?`)) return;

    setDeletingFile(file.relativePath);
    setUploadFeedback(null);
    try {
      await deleteKnowledgeFile(file.relativePath);
      setUploadFeedback({
        severity: 'success',
        message: `${file.relativePath} was deleted from the knowledge base.`,
      });
    } catch (deleteError) {
      setUploadFeedback({
        severity: 'error',
        message: deleteError instanceof Error ? deleteError.message : 'Unable to delete the knowledge file.',
      });
      return;
    } finally {
      setDeletingFile('');
    }

    try {
      await refreshKnowledgeFiles();
    } catch (filesError) {
      setUploadFeedback({
        severity: 'error',
        message: `${file.relativePath} was deleted, but the knowledge file list could not be refreshed: ${filesError instanceof Error ? filesError.message : 'Unknown error.'}`,
      });
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          background: 'radial-gradient(circle at top, #132d3d, #07141c 55%)',
          px: 2,
          py: 3,
        }}
      >
        <Card
          sx={{
            width: '100%',
            maxWidth: 1150,
            height: { xs: 'calc(100dvh - 16px)', sm: 'calc(100vh - 32px)' },
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'rgba(9, 20, 28, 0.8)',
            border: '1px solid rgba(118, 228, 255, 0.15)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Box
            sx={{
              px: { xs: 1.5, sm: 3 },
              py: 2,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
              <SmartToyRoundedIcon color="primary" />
              <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: '1.15rem', sm: '1.5rem' } }}>
                Trident AI Assistant
              </Typography>
            </Stack>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}
            >
              <Button
                component="label"
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<CloudUploadOutlinedIcon />}
                disabled={uploadingKnowledge || uploadPreviewLoading}
              >
                {uploadingKnowledge ? 'Uploading…' : 'Upload knowledge'}
                <input
                  hidden
                  type="file"
                  accept=".md,.txt,text/markdown,text/plain"
                  onChange={(event) => void handleUploadFileSelection(event)}
                />
              </Button>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<FolderOpenOutlinedIcon />}
                onClick={() => void handleToggleKnowledgeFiles()}
              >
                Knowledge files
              </Button>
              <Tooltip title="Clear visible chat (saved history remains)">
                <span>
                  <Button
                    variant="outlined"
                    color="inherit"
                    size="small"
                    startIcon={<DeleteSweepOutlinedIcon />}
                    disabled={loading || !messages.some((message) => message.role === 'user')}
                    onClick={handleClearVisibleChat}
                  >
                    Clear chat
                  </Button>
                </span>
              </Tooltip>
              <Chip label="RAG-enabled" color="primary" variant="outlined" />
            </Stack>
          </Box>

          <Box
            sx={{
              flexGrow: 1,
              overflowY: 'auto',
              px: { xs: 1.5, md: 3 },
              py: 2,
              background: 'rgba(0,0,0,0.08)',
            }}
          >
            <Stack spacing={2}>
              {chatNotice && (
                <Alert severity={chatNotice.severity} onClose={() => setChatNotice(null)}>
                  {chatNotice.message}
                </Alert>
              )}
              {uploadFeedback && (
                <Alert severity={uploadFeedback.severity} onClose={() => setUploadFeedback(null)}>
                  {uploadFeedback.message}
                </Alert>
              )}
              {messages.length === 1 && messages[0]?.id === 'welcome' && suggestedQuestions.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Try asking
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    {suggestedQuestions.map((question) => (
                      <Chip
                        key={question}
                        label={question}
                        clickable
                        color="primary"
                        variant="outlined"
                        onClick={() => setDraft(question)}
                        sx={{ height: 'auto', '& .MuiChip-label': { display: 'block', whiteSpace: 'normal', py: 0.75 } }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
              {messages.map((message) => (
                <Box
                  key={message.id}
                  sx={{
                    display: 'flex',
                    justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Card
                    sx={{
                      maxWidth: { xs: '90%', md: '75%' },
                      background: message.role === 'user' ? 'linear-gradient(135deg, #123b58, #0e5a72)' : '#12212d',
                      border: '1px solid rgba(255,255,255,0.06)',
                      boxShadow: 'none',
                    }}
                  >
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>
                        {new Date(message.timestamp).toLocaleString()} • {message.role === 'user' ? 'You' : 'Trident AI'}
                      </Typography>
                      {message.role === 'assistant' && message.id !== 'welcome' && (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
                          <Tooltip title={copiedMessageId === message.id ? 'Copied' : 'Copy answer'}>
                            <IconButton
                              size="small"
                              aria-label="Copy answer"
                              onClick={() => void handleCopyAnswer(message)}
                            >
                              {copiedMessageId === message.id
                                ? <CheckOutlinedIcon fontSize="small" />
                                : <ContentCopyOutlinedIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {message.content}
                      </Typography>

                      {message.references && message.references.length > 0 && (
                        <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {message.references.map((reference) => (
                            <Chip key={reference} label={reference} size="small" color="primary" variant="outlined" />
                          ))}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Box>
              ))}

              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <Card sx={{ background: '#12212d', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <CardContent sx={{ py: 1.5, px: 2 }}>
                      <Typography variant="body2">Thinking through the retrieved knowledge…</Typography>
                    </CardContent>
                  </Card>
                </Box>
              )}

              {error && (
                <Alert severity="error">{error}</Alert>
              )}
            </Stack>
            <div ref={scrollRef} />
          </Box>

          <Divider />

          <Box sx={{ p: 2, background: 'rgba(255,255,255,0.02)' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <TextField
                fullWidth
                multiline
                maxRows={5}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about onboarding, migration, access, or namespace validation…"
                variant="outlined"
                disabled={loading || historyLoading}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    background: '#0d1c28',
                    borderRadius: 2,
                  },
                }}
              />
              <Button
                variant="contained"
                color="primary"
                endIcon={<SendIcon />}
                onClick={() => void handleSend()}
                disabled={!draft.trim() || loading || historyLoading}
                sx={{ minWidth: { xs: '100%', md: 180 }, height: 56 }}
              >
                Send
              </Button>
            </Stack>
          </Box>
        </Card>
        <Dialog
          open={knowledgeFilesOpen}
          onClose={() => setKnowledgeFilesOpen(false)}
          fullWidth
          maxWidth="sm"
          aria-labelledby="knowledge-files-title"
          slotProps={{ paper: { sx: { bgcolor: 'background.paper', backgroundImage: 'none' } } }}
        >
          <DialogTitle id="knowledge-files-title">
            Knowledge files ({knowledgeFiles.length})
          </DialogTitle>
          <DialogContent dividers>
            <TextField
              fullWidth
              size="small"
              value={knowledgeSearch}
              onChange={(event) => setKnowledgeSearch(event.target.value)}
              placeholder="Search knowledge files"
              aria-label="Search knowledge files"
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlinedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            {knowledgeFiles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No knowledge files found.</Typography>
            ) : filteredKnowledgeFiles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No files match your search.</Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={0}>
                {filteredKnowledgeFiles.map((file) => (
                  <Box
                    key={file.relativePath}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}
                  >
                    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        {file.relativePath}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          label={file.relativePath.toLowerCase().endsWith('.txt') ? 'Transcript · TXT' : 'Markdown · MD'}
                          variant="outlined"
                          color={file.relativePath.toLowerCase().endsWith('.txt') ? 'secondary' : 'primary'}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {Math.ceil(file.sizeBytes / 1024)} KB · Updated {new Date(file.updatedAt).toLocaleDateString()}
                        </Typography>
                      </Stack>
                    </Stack>
                    <Tooltip title="Delete knowledge file">
                      <span>
                        <IconButton
                          aria-label={`Delete ${file.relativePath}`}
                          color="error"
                          size="small"
                          disabled={Boolean(deletingFile)}
                          onClick={() => void handleDeleteKnowledgeFile(file)}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            )}
            {uploadFeedback && (
              <Alert severity={uploadFeedback.severity} sx={{ mt: 2 }} onClose={() => setUploadFeedback(null)}>
                {uploadFeedback.message}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setKnowledgeFilesOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={pendingUploadFile !== null}
          onClose={() => {
            if (!uploadingKnowledge) {
              setPendingUploadFile(null);
              setUploadPreview('');
              setUploadPreviewError('');
            }
          }}
          fullWidth
          maxWidth="md"
          fullScreen={isSmallScreen}
          aria-labelledby="upload-preview-title"
        >
          <DialogTitle id="upload-preview-title">Preview knowledge upload</DialogTitle>
          <DialogContent dividers>
            {pendingUploadFile && (
              <Stack spacing={1.5}>
                <Typography variant="body2">
                  {pendingUploadFile.name} · {(pendingUploadFile.size / 1024).toFixed(1)} KB ·{' '}
                  {pendingUploadFile.name.toLowerCase().endsWith('.txt') ? 'Plain-text transcript' : 'Markdown'}
                </Typography>
                {uploadPreviewLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : uploadPreviewError ? (
                  <Alert severity="error">{uploadPreviewError}</Alert>
                ) : (
                  <>
                    <Box
                      component="pre"
                      sx={{
                        maxHeight: { xs: '55dvh', sm: 420 },
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        p: 2,
                        m: 0,
                        borderRadius: 1,
                        bgcolor: 'rgba(0,0,0,0.2)',
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      }}
                    >
                      {uploadPreview.slice(0, UPLOAD_PREVIEW_CHARACTERS)}
                    </Box>
                    {uploadPreview.length > UPLOAD_PREVIEW_CHARACTERS && (
                      <Typography variant="caption" color="text.secondary">
                        Preview limited to the first {UPLOAD_PREVIEW_CHARACTERS.toLocaleString()} characters. The full file will be uploaded.
                      </Typography>
                    )}
                  </>
                )}
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={() => {
                setPendingUploadFile(null);
                setUploadPreview('');
                setUploadPreviewError('');
              }}
              disabled={uploadingKnowledge}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleConfirmKnowledgeUpload()}
              disabled={!pendingUploadFile || Boolean(uploadPreviewError) || uploadPreviewLoading || uploadingKnowledge}
            >
              {uploadingKnowledge ? 'Uploading…' : 'Add to knowledge base'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;
