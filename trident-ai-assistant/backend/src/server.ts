import cors from 'cors';
import express from 'express';
import authRouter from './routes/auth';
import chatRouter from './routes/chat';
import knowledgeRouter from './routes/knowledge';
import { getKnowledgeSetupCode, isKnowledgeAuthConfigured } from './services/knowledgeAuth';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(authRouter);
app.use(chatRouter);
app.use(knowledgeRouter);

async function startServer(): Promise<void> {
  if (!(await isKnowledgeAuthConfigured())) {
    console.warn('[auth] first-run knowledge administrator setup code (keep private):');
    console.warn(getKnowledgeSetupCode());
  }

  app.listen(port, () => {
    console.log(`Trident AI Assistant backend listening on http://localhost:${port}`);
  });
}

void startServer().catch((error: unknown) => {
  console.error('[server] failed to start:', error);
  process.exitCode = 1;
});
