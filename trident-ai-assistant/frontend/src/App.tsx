import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CssBaseline,
  Divider,
  Stack,
  TextField,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import { sendChatQuestion } from './services/chatApi';
import type { ChatMessage, ChatResponse } from './types/chat';

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
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
            <Chip label="RAG-enabled" color="primary" variant="outlined" />
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
                disabled={loading}
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
                disabled={!draft.trim() || loading}
                sx={{ minWidth: { xs: '100%', md: 180 }, height: 56 }}
              >
                Send
              </Button>
            </Stack>
          </Box>
        </Card>
      </Box>
    </ThemeProvider>
  );
}

export default App;
