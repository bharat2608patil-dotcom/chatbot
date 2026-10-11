import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CssBaseline,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  TextField,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import CleaningServicesOutlinedIcon from '@mui/icons-material/CleaningServicesOutlined';
import {
  clearChatHistory,
  deleteKnowledgeFile,
  getKnowledgeAuthStatus,
  getKnowledgeFiles,
  loadChatHistory,
  loginKnowledgeAdmin,
  logoutKnowledgeAdmin,
  sendChatQuestion,
  setupKnowledgeAdmin,
  uploadKnowledgeFile,
  type KnowledgeAuthStatus,
} from './services/chatApi';
import type { ChatMessage, ChatResponse, KnowledgeFile } from './types/chat';

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
  const [messages, setMessages] = useState<ChatMessage[]>([starterMessage]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [knowledgeFilesOpen, setKnowledgeFilesOpen] = useState(false);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [deletingFile, setDeletingFile] = useState('');
  const [authStatus, setAuthStatus] = useState<KnowledgeAuthStatus | null>(null);
  const [authStatusLoading, setAuthStatusLoading] = useState(true);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirmation, setAuthPasswordConfirmation] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUploading, setPreviewUploading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [clearChatOpen, setClearChatOpen] = useState(false);
  const [clearChatBusy, setClearChatBusy] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
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
    getKnowledgeAuthStatus()
      .then((status) => {
        if (!cancelled) setAuthStatus(status);
      })
      .catch((statusError: unknown) => {
        if (!cancelled) {
          setAuthError(statusError instanceof Error ? statusError.message : 'Unable to check knowledge administrator status.');
        }
      })
      .finally(() => {
        if (!cancelled) setAuthStatusLoading(false);
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

  const handleRefreshAuthStatus = async () => {
    setAuthStatusLoading(true);
    setAuthError('');
    try {
      setAuthStatus(await getKnowledgeAuthStatus());
    } catch (statusError) {
      setAuthError(statusError instanceof Error ? statusError.message : 'Unable to check knowledge administrator status.');
    } finally {
      setAuthStatusLoading(false);
    }
  };

  const handleAuthSubmit = async () => {
    const isSetup = authStatus?.configured === false;
    if (isSetup && authPassword !== authPasswordConfirmation) {
      setAuthError('The passwords do not match.');
      return;
    }

    setAuthBusy(true);
    setAuthError('');
    try {
      if (isSetup) {
        await setupKnowledgeAdmin(authUsername, authPassword);
      } else {
        await loginKnowledgeAdmin(authUsername, authPassword);
      }
      setAuthStatus(await getKnowledgeAuthStatus());
      setAuthDialogOpen(false);
      setAuthPassword('');
      setAuthPasswordConfirmation('');
      setSnackbarMessage(isSetup ? 'Knowledge administrator created.' : 'Signed in to knowledge management.');
    } catch (loginError) {
      setAuthError(loginError instanceof Error ? loginError.message : 'Knowledge administrator authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);
    setAuthError('');
    try {
      await logoutKnowledgeAdmin();
      setAuthStatus({ configured: true, authenticated: false });
      setKnowledgeFilesOpen(false);
      setKnowledgeFiles([]);
      setSnackbarMessage('Signed out of knowledge management.');
    } catch (logoutError) {
      setAuthError(logoutError instanceof Error ? logoutError.message : 'Unable to sign out.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleToggleKnowledgeFiles = async () => {
    const open = !knowledgeFilesOpen;
    setKnowledgeFilesOpen(open);
    if (!open) return;

    setUploadFeedback(null);
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

  const handleKnowledgeFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'md' && extension !== 'txt') {
      setUploadFeedback({ severity: 'error', message: 'Choose a Markdown (.md) or plain-text (.txt) file.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadFeedback({ severity: 'error', message: 'The knowledge file must be 5 MB or smaller.' });
      return;
    }

    setPreviewLoading(true);
    setPreviewError('');
    setUploadFeedback(null);
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (!content.trim() || content.includes('\0')) {
        throw new Error('The knowledge file must contain readable text.');
      }
      setPreviewFile(file);
      setPreviewContent(content);
    } catch (fileError) {
      setPreviewFile(null);
      setPreviewContent('');
      setUploadFeedback({
        severity: 'error',
        message: fileError instanceof Error ? fileError.message : 'The file could not be previewed as UTF-8 text.',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmKnowledgeUpload = async () => {
    if (!previewFile) return;

    setPreviewUploading(true);
    setPreviewError('');
    try {
      const result = await uploadKnowledgeFile(previewFile);
      setUploadFeedback({
        severity: 'success',
        message: `${result.fileName} was added to the knowledge base.`,
      });
      setPreviewFile(null);
      setPreviewContent('');
      if (knowledgeFilesOpen) {
        try {
          await refreshKnowledgeFiles();
        } catch (filesError) {
          setUploadFeedback({
            severity: 'error',
            message: `The file was uploaded, but the knowledge file list could not be refreshed: ${filesError instanceof Error ? filesError.message : 'Unknown error.'}`,
          });
        }
      }
      setSnackbarMessage('Knowledge file uploaded.');
    } catch (uploadError) {
      setPreviewError(uploadError instanceof Error ? uploadError.message : 'Unable to upload the knowledge file.');
    } finally {
      setPreviewUploading(false);
    }
  };

  const handleDeleteKnowledgeFile = async (file: KnowledgeFile) => {
    if (!window.confirm(`Delete ${file.relativePath} from the knowledge base?`)) return;

    setDeletingFile(file.relativePath);
    setUploadFeedback(null);
    try {
      await deleteKnowledgeFile(file.relativePath);
      await refreshKnowledgeFiles();
      setUploadFeedback({
        severity: 'success',
        message: `${file.relativePath} was deleted from the knowledge base.`,
      });
    } catch (deleteError) {
      setUploadFeedback({
        severity: 'error',
        message: deleteError instanceof Error ? deleteError.message : 'Unable to delete the knowledge file.',
      });
    } finally {
      setDeletingFile('');
    }
  };

  const handleCopyResponse = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      setSnackbarMessage('Response copied to clipboard.');
      window.setTimeout(() => setCopiedMessageId(''), 1800);
    } catch {
      setError('The response could not be copied. Check clipboard permissions and try again.');
    }
  };

  const handleClearChat = async () => {
    setClearChatBusy(true);
    setError('');
    try {
      await clearChatHistory();
      setMessages([starterMessage]);
      setDraft('');
      setClearChatOpen(false);
      setSnackbarMessage('Chat history cleared.');
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Unable to clear chat history.');
    } finally {
      setClearChatBusy(false);
    }
  };

  const filteredKnowledgeFiles = knowledgeFiles.filter((file) =>
    file.relativePath.toLowerCase().includes(knowledgeSearch.trim().toLowerCase()),
  );

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
            height: { xs: '100dvh', sm: 'calc(100vh - 32px)' },
            minHeight: 520,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'rgba(9, 20, 28, 0.8)',
            border: '1px solid rgba(118, 228, 255, 0.15)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Box
            sx={{
              px: { xs: 1.5, md: 3 },
              py: 1.75,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'space-between',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <SmartToyRoundedIcon color="primary" sx={{ fontSize: 32 }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  Trident AI Assistant
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Answers grounded in your local knowledge base
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              {authStatus?.authenticated ? (
                <>
                  <Button
                    component="label"
                    variant="outlined"
                    color="primary"
                    size="small"
                    startIcon={<CloudUploadOutlinedIcon />}
                    disabled={previewLoading || previewUploading}
                  >
                    {previewLoading ? 'Preparing preview…' : 'Upload knowledge'}
                    <input
                      hidden
                      type="file"
                      accept=".md,.txt,text/markdown,text/plain"
                      onChange={(event) => void handleKnowledgeFileSelected(event)}
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
                  <Tooltip title="Sign out of knowledge management">
                    <span>
                      <IconButton
                        aria-label="Sign out of knowledge management"
                        color="primary"
                        onClick={() => void handleLogout()}
                        disabled={authBusy}
                        size="small"
                      >
                        <LogoutOutlinedIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              ) : (
                <Button
                  variant="outlined"
                  color="primary"
                  size="small"
                  onClick={() => {
                    setAuthError('');
                    setAuthDialogOpen(true);
                  }}
                  disabled={authStatusLoading || !authStatus}
                >
                  {authStatusLoading ? 'Checking access…' : authStatus?.configured ? 'Knowledge admin sign in' : 'Set up knowledge admin'}
                </Button>
              )}
              <Tooltip title="Clear saved chat history">
                <span>
                  <Button
                    variant="text"
                    color="inherit"
                    size="small"
                    startIcon={<CleaningServicesOutlinedIcon />}
                    onClick={() => setClearChatOpen(true)}
                    disabled={loading || historyLoading || clearChatBusy}
                  >
                    Clear chat
                  </Button>
                </span>
              </Tooltip>
              <Chip label="RAG-enabled" color="primary" variant="outlined" size="small" />
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
              {uploadFeedback && (
                <Alert severity={uploadFeedback.severity} onClose={() => setUploadFeedback(null)}>
                  {uploadFeedback.message}
                </Alert>
              )}
              {authError && !authDialogOpen && (
                <Alert
                  severity="error"
                  action={<Button color="inherit" size="small" onClick={() => void handleRefreshAuthStatus()}>Retry</Button>}
                >
                  {authError}
                </Alert>
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
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                        {message.content}
                      </Typography>

                      {message.references && message.references.length > 0 && (
                        <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {message.references.map((reference, index) => (
                            <Chip key={`${reference}-${index}`} label={reference} size="small" color="primary" variant="outlined" />
                          ))}
                        </Box>
                      )}
                      {message.role === 'assistant' && message.id !== 'welcome' && (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                          <Tooltip title={copiedMessageId === message.id ? 'Copied' : 'Copy response'}>
                            <Button
                              size="small"
                              color="inherit"
                              startIcon={<ContentCopyOutlinedIcon fontSize="small" />}
                              onClick={() => void handleCopyResponse(message)}
                              aria-label="Copy response"
                            >
                              {copiedMessageId === message.id ? 'Copied' : 'Copy'}
                            </Button>
                          </Tooltip>
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
          onClose={() => {
            setKnowledgeFilesOpen(false);
            setKnowledgeSearch('');
          }}
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
              placeholder="Search by file name"
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
              <Typography variant="body2" color="text.secondary">No files match “{knowledgeSearch}”.</Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={0}>
                {filteredKnowledgeFiles.map((file) => (
                  <Box
                    key={file.relativePath}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, py: 1.25 }}
                  >
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        {file.relativePath}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                        <Chip
                          label={file.fileType === 'md' ? 'Markdown · .md' : 'Plain text · .txt'}
                          size="small"
                          variant="outlined"
                          color="primary"
                        />
                        <Typography variant="caption" color="text.secondary">
                          {Math.ceil(file.sizeBytes / 1024)} KB · Updated {new Date(file.updatedAt).toLocaleDateString()}
                        </Typography>
                      </Stack>
                    </Box>
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
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              setKnowledgeFilesOpen(false);
              setKnowledgeSearch('');
            }}>Close</Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={authDialogOpen}
          onClose={() => {
            if (!authBusy) setAuthDialogOpen(false);
          }}
          fullWidth
          maxWidth="xs"
          aria-labelledby="knowledge-auth-title"
          slotProps={{ paper: { sx: { bgcolor: 'background.paper', backgroundImage: 'none' } } }}
        >
          <DialogTitle id="knowledge-auth-title">
            {authStatus?.configured ? 'Knowledge administrator sign in' : 'Set up knowledge administrator'}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {authError && <Alert severity="error">{authError}</Alert>}
              <Typography variant="body2" color="text.secondary">
                {authStatus?.configured
                  ? 'Sign in to upload, search, and manage knowledge files. Chat remains available without signing in.'
                  : 'Create the local administrator account used only for knowledge-file management.'}
              </Typography>
              <TextField
                autoFocus
                fullWidth
                label="Username"
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
                autoComplete="username"
                slotProps={{ htmlInput: { maxLength: 64 } }}
                disabled={authBusy}
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                autoComplete={authStatus?.configured ? 'current-password' : 'new-password'}
                slotProps={{ htmlInput: { maxLength: 128 } }}
                helperText={authStatus?.configured ? undefined : 'Use 12–128 characters.'}
                disabled={authBusy}
              />
              {!authStatus?.configured && (
                <TextField
                  fullWidth
                  label="Confirm password"
                  type="password"
                  value={authPasswordConfirmation}
                  onChange={(event) => setAuthPasswordConfirmation(event.target.value)}
                  autoComplete="new-password"
                  slotProps={{ htmlInput: { maxLength: 128 } }}
                  disabled={authBusy}
                />
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAuthDialogOpen(false)} disabled={authBusy}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => void handleAuthSubmit()}
              disabled={authBusy || !authUsername.trim() || !authPassword || (!authStatus?.configured && !authPasswordConfirmation)}
            >
              {authBusy ? 'Please wait…' : authStatus?.configured ? 'Sign in' : 'Create administrator'}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={Boolean(previewFile)}
          onClose={() => {
            if (!previewUploading) {
              setPreviewFile(null);
              setPreviewContent('');
              setPreviewError('');
            }
          }}
          fullWidth
          maxWidth="md"
          aria-labelledby="knowledge-preview-title"
          slotProps={{ paper: { sx: { bgcolor: 'background.paper', backgroundImage: 'none' } } }}
        >
          <DialogTitle id="knowledge-preview-title">Review knowledge file</DialogTitle>
          <DialogContent dividers>
            {previewFile && (
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="subtitle1" sx={{ overflowWrap: 'anywhere', fontWeight: 600 }}>
                    {previewFile.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {previewFile.name.toLowerCase().endsWith('.md') ? 'Markdown (.md)' : 'Plain text (.txt)'}
                    {' · '}{(previewFile.size / 1024).toFixed(1)} KB
                  </Typography>
                </Box>
                {previewError && <Alert severity="error">{previewError}</Alert>}
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 2,
                    maxHeight: 360,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    borderRadius: 2,
                    bgcolor: 'rgba(0,0,0,0.24)',
                    color: 'text.primary',
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
                  }}
                >
                  {previewContent.slice(0, 6000)}
                  {previewContent.length > 6000 && '\n\n… Preview truncated. The complete file will be uploaded.'}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Confirm to add this file to the knowledge base. Existing files are not overwritten.
                </Typography>
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setPreviewFile(null);
                setPreviewContent('');
                setPreviewError('');
              }}
              disabled={previewUploading}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={() => void handleConfirmKnowledgeUpload()}
              disabled={!previewFile || previewUploading || !authStatus?.authenticated}
            >
              {previewUploading ? 'Uploading…' : 'Confirm upload'}
            </Button>
          </DialogActions>
        </Dialog>
        <Dialog
          open={clearChatOpen}
          onClose={() => {
            if (!clearChatBusy) setClearChatOpen(false);
          }}
          maxWidth="xs"
          fullWidth
          aria-labelledby="clear-chat-title"
          slotProps={{ paper: { sx: { bgcolor: 'background.paper', backgroundImage: 'none' } } }}
        >
          <DialogTitle id="clear-chat-title">Clear chat history?</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary">
              This removes the saved conversation from chat history. Your knowledge files and submitted-question records will not be changed.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setClearChatOpen(false)} disabled={clearChatBusy}>Cancel</Button>
            <Button color="error" variant="contained" onClick={() => void handleClearChat()} disabled={clearChatBusy}>
              {clearChatBusy ? 'Clearing…' : 'Clear history'}
            </Button>
          </DialogActions>
        </Dialog>
        <Snackbar
          open={Boolean(snackbarMessage)}
          autoHideDuration={2800}
          onClose={() => setSnackbarMessage('')}
          message={snackbarMessage}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </Box>
    </ThemeProvider>
  );
}

export default App;
