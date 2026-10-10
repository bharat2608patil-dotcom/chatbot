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
import { deleteKnowledgeFile, getKnowledgeFiles, loadChatHistory, sendChatQuestion, uploadKnowledgeFile } from './services/chatApi';
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
  const [uploadingKnowledge, setUploadingKnowledge] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [knowledgeFilesOpen, setKnowledgeFilesOpen] = useState(false);
  const [deletingFile, setDeletingFile] = useState('');
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
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const refreshKnowledgeFiles = async () => {
    const files = await getKnowledgeFiles();
    setKnowledgeFiles(files);
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

  const handleKnowledgeUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setUploadingKnowledge(true);
    setUploadFeedback(null);
    try {
      const result = await uploadKnowledgeFile(file);
      setUploadFeedback({
        severity: 'success',
        message: `${result.fileName} was added to the knowledge base.`,
      });
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
    } catch (uploadError) {
      setUploadFeedback({
        severity: 'error',
        message: uploadError instanceof Error ? uploadError.message : 'Unable to upload the knowledge file.',
      });
    } finally {
      setUploadingKnowledge(false);
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
            height: 'calc(100vh - 32px)',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'rgba(9, 20, 28, 0.8)',
            border: '1px solid rgba(118, 228, 255, 0.15)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Box
            sx={{
              px: 3,
              py: 2,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <SmartToyRoundedIcon color="primary" />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Trident AI Assistant
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button
                component="label"
                variant="outlined"
                color="primary"
                size="small"
                startIcon={<CloudUploadOutlinedIcon />}
                disabled={uploadingKnowledge}
              >
                {uploadingKnowledge ? 'Uploading…' : 'Upload .md'}
                <input
                  hidden
                  type="file"
                  accept=".md,text/markdown"
                  onChange={(event) => void handleKnowledgeUpload(event)}
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
              {uploadFeedback && (
                <Alert severity={uploadFeedback.severity} onClose={() => setUploadFeedback(null)}>
                  {uploadFeedback.message}
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
          PaperProps={{ sx: { bgcolor: 'background.paper', backgroundImage: 'none' } }}
        >
          <DialogTitle id="knowledge-files-title">
            Knowledge files ({knowledgeFiles.length})
          </DialogTitle>
          <DialogContent dividers>
            {knowledgeFiles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No Markdown files found.</Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={0}>
                {knowledgeFiles.map((file) => (
                  <Box
                    key={file.relativePath}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1 }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        {file.relativePath}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {Math.ceil(file.sizeBytes / 1024)} KB · Updated {new Date(file.updatedAt).toLocaleDateString()}
                      </Typography>
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
            <Button onClick={() => setKnowledgeFilesOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

export default App;
